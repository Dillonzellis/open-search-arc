const { Client } = require("@opensearch-project/opensearch");
const AWS = require("aws-sdk");

const getClient = () => {
  const client = new Client({
    node: process.env.OPENSEARCH_ENDPOINT,
    Connection: require("@opensearch-project/opensearch").AwsConnection,
    awsConfig: {
      credentials: new AWS.EnvironmentCredentials("AWS"),
      region: process.env.AWS_REGION,
    },
  });
  return client;
};

const itemsToArray = (itemString = "") =>
  itemString ? itemString.split(",").map((item) => item.trim()) : [];

const buildBodyFromQuery = (params) => {
  const {
    arcSite,
    "arc-site": arcSiteAlt,
    daysBack,
    includeDistributor,
    includeContentTypes,
    includeSections,
    mustIncludeAllTags,
    includeTags,
    includeSubtypes,
    excludeDistributor,
    excludeContentTypes,
    excludeSections,
    excludeTags,
    excludeSubtypes,
    mustIncludeThumbnail,
  } = params;

  const activeSite = arcSite || arcSiteAlt;

  const query = {
    bool: {
      must: [{ term: { canonical_website: activeSite } }],
      must_not: [],
      filter: [],
    },
  };

  if (daysBack) {
    const now = new Date();
    const pastDate = new Date();
    pastDate.setDate(now.getDate() - parseInt(daysBack, 10));

    query.bool.filter.push({
      range: {
        display_date: {
          gte: pastDate.toISOString(),
          lte: now.toISOString(),
        },
      },
    });
  }

  if (includeContentTypes) {
    const types = itemsToArray(includeContentTypes);
    if (types.length > 0) {
      query.bool.must.push({
        terms: { type: types },
      });
    }
  }

  if (includeSubtypes) {
    const subtypes = itemsToArray(includeSubtypes);
    if (subtypes.length > 0) {
      query.bool.must.push({
        terms: { subtype: subtypes },
      });
    }
  }

  if (includeSections) {
    const sections = itemsToArray(includeSections);
    if (sections.length > 0) {
      query.bool.must.push({
        nested: {
          path: "taxonomy.sections",
          query: {
            terms: { "taxonomy.sections._id": sections },
          },
        },
      });
    }
  }

  if (includeDistributor) {
    const distributors = itemsToArray(includeDistributor);
    if (distributors.length > 0) {
      query.bool.must.push({
        terms: { "distributor.reference_id": distributors },
      });
    }
  }

  if (includeTags) {
    const tags = itemsToArray(includeTags);
    if (tags.length > 0) {
      if (mustIncludeAllTags === "true") {
        // AND logic - must have all tags
        tags.forEach((tag) => {
          query.bool.must.push({
            nested: {
              path: "taxonomy.tags",
              query: {
                bool: {
                  should: [
                    { term: { "taxonomy.tags.text": tag } },
                    { term: { "taxonomy.tags.slug": tag } },
                  ],
                },
              },
            },
          });
        });
      } else {
        // OR logic - must have any of the tags
        query.bool.must.push({
          nested: {
            path: "taxonomy.tags",
            query: {
              bool: {
                should: tags.map((tag) => ({
                  bool: {
                    should: [
                      { term: { "taxonomy.tags.text": tag } },
                      { term: { "taxonomy.tags.slug": tag } },
                    ],
                  },
                })),
              },
            },
          },
        });
      }
    }
  }

  if (excludeContentTypes) {
    const types = itemsToArray(excludeContentTypes);
    if (types.length > 0) {
      query.bool.must_not.push({
        terms: { type: types },
      });
    }
  }

  if (excludeSubtypes) {
    const subtypes = itemsToArray(excludeSubtypes);
    if (subtypes.length > 0) {
      query.bool.must_not.push({
        terms: { subtype: subtypes },
      });
    }
  }

  if (excludeSections) {
    const sections = itemsToArray(excludeSections);
    if (sections.length > 0) {
      query.bool.must_not.push({
        nested: {
          path: "taxonomy.sections",
          query: {
            terms: { "taxonomy.sections._id": sections },
          },
        },
      });
    }
  }

  if (excludeDistributor) {
    const distributors = itemsToArray(excludeDistributor);
    if (distributors.length > 0) {
      query.bool.must_not.push({
        terms: { "distributor.reference_id": distributors },
      });
    }
  }

  if (excludeTags) {
    const tags = itemsToArray(excludeTags);
    if (tags.length > 0) {
      tags.forEach((tag) => {
        query.bool.must_not.push({
          nested: {
            path: "taxonomy.tags",
            query: {
              bool: {
                should: [
                  { term: { "taxonomy.tags.text": tag } },
                  { term: { "taxonomy.tags.slug": tag } },
                ],
              },
            },
          },
        });
      });
    }
  }

  if (mustIncludeThumbnail === "true") {
    query.bool.must.push({
      exists: { field: "promo_items.basic" },
    });
  }

  return query;
};

// Execute the OpenSearch query
const executeQuery = async (client, indexName, query, from, size) => {
  const response = await client.search({
    index: indexName,
    body: {
      query,
      from: parseInt(from, 10) || 0,
      size: parseInt(size, 10) || 10,
      sort: [{ display_date: { order: "desc" } }],
    },
  });

  return response.body.hits.hits.map((hit) => hit._source);
};

exports.handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  try {
    const params = event.queryStringParameters || {};

    const activeSite = params.arcSite || params["arc-site"];
    if (!activeSite) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Missing required parameter: arc-site or arcSite",
        }),
      };
    }

    const query = buildBodyFromQuery(params);

    const client = getClient();
    const indexName = process.env.OPENSEARCH_INDEX;

    // Extract pagination parameters
    const { from = 0, size = 10 } = params;

    // Handle excludeTheseStoryIds separately as it needs special processing
    let excludeTheseStoryIds = params.excludeTheseStoryIds || "";
    if (excludeTheseStoryIds) {
      // Convert to array if it's a string
      if (typeof excludeTheseStoryIds === "string") {
        excludeTheseStoryIds = itemsToArray(excludeTheseStoryIds);
      }

      // Add to the must_not clause of the query
      if (excludeTheseStoryIds.length > 0) {
        query.bool.must_not.push({
          terms: { _id: excludeTheseStoryIds },
        });
      }
    }

    const results = await executeQuery(client, indexName, query, from, size);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // For CORS
      },
      body: JSON.stringify(results),
    };
  } catch (error) {
    console.error("Error processing request:", error);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
    };
  }
};
