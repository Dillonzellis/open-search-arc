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

// just get indexed fields
const processANSObject = (ansObject) => {
  return {
    _id: ansObject._id,
    display_date: ansObject.display_date || ansObject.created_date, // incase its not published
    type: ansObject.type,
    subtype: ansObject.subtype,
    distributor: ansObject.distributor
      ? {
          reference_id: ansObject.distributor.reference_id,
        }
      : null,
    taxonomy: {
      sections:
        ansObject.taxonomy?.sections?.map((section) => ({
          _id: section._id,
        })) || [],
      tags:
        ansObject.taxonomy?.tags?.map((tag) => ({
          text: tag.text,
          slug: tag.slug,
        })) || [],
    },
  };
};

const handleComposerEvent = async (event, opensearchClient) => {
  const { type: eventType, payload: ansObject } = event;
  const indexName = process.env.OPENSEARCH_INDEX;

  switch (eventType) {
    case "story.update":
    case "story.publish": {
      const processedDocument = processANSObject(ansObject);
      await opensearchClient.index({
        index: indexName,
        id: processedDocument._id,
        body: processedDocument,
        refresh: true,
      });
      break;
    }

    case "story.unpublish":
    case "story.delete": {
      await opensearchClient.delete({
        index: indexName,
        id: ansObject._id,
        refresh: true,
      });
      break;
    }

    default:
  }
};

exports.handler = async (event, context) => {
  try {
    const opensearchClient = getClient();
    await handleComposerEvent(event, opensearchClient);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Successfully processed event",
        documentId: event.payload._id,
      }),
    };
  } catch (error) {
    console.error("Error processing event:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Error processing event",
        error: error.message,
      }),
    };
  }
};
