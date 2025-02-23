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

const validateAnsObject = (ansObject, operation) => {
  if (!ansObject || !ansObject._id) {
    throw new Error(
      `Invalid ANS object for ${operation} operation: missing _id field`,
    );
  }
  return true;
};

const handleComposerEvent = async (event, opensearchClient) => {
  const { type: eventType, payload: ansObject } = event;
  const indexName = process.env.OPENSEARCH_INDEX;

  console.log(
    `Processing ${eventType} event for document ${ansObject?._id || "unknown"}`,
  );

  switch (eventType) {
    case "story.update":
    case "story.publish": {
      validateAnsObject(ansObject, "index");

      // make new document without content_elements
      const { content_elements, ...ansToIndex } = ansObject;

      console.log(
        `Indexing document ${ansObject._id} (${ansToIndex.headlines?.basic || "no title"}) without content_elements`,
      );

      const response = await opensearchClient.index({
        index: indexName,
        id: ansObject._id,
        body: ansToIndex,
        refresh: true,
      });

      console.log(
        `Successfully indexed document with ID ${ansObject._id}, result: ${response.result}`,
      );
      return {
        status: "success",
        operation: "index",
        id: ansObject._id,
        result: response.result,
      };
    }

    case "story.unpublish":
    case "story.delete": {
      validateAnsObject(ansObject, "delete");

      console.log(`Deleting document with ID ${ansObject._id}`);

      const response = await opensearchClient.delete({
        index: indexName,
        id: ansObject._id,
        refresh: true,
      });

      console.log(
        `Successfully deleted document with ID ${ansObject._id}, result: ${response.result}`,
      );
      return {
        status: "success",
        operation: "delete",
        id: ansObject._id,
        result: response.result,
      };
    }

    default:
      const errorMessage = `Unsupported event type: ${eventType}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
  }
};

exports.handler = async (event, context) => {
  try {
    console.log("Received event:", JSON.stringify(event, null, 2));

    const opensearchClient = getClient();
    const result = await handleComposerEvent(event, opensearchClient);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Successfully processed event",
        result,
      }),
    };
  } catch (error) {
    console.error("Error processing event:", error);

    // Handle specific OpenSearch errors
    if (error.meta?.body?.error) {
      const errorType = error.meta.body.error.type;
      console.error(`OpenSearch error type: ${errorType}`);

      if (errorType === "index_not_found_exception") {
        return {
          statusCode: 500,
          body: JSON.stringify({
            message:
              "Index does not exist. Please create the index before processing events.",
            error: error.message,
            errorType,
          }),
        };
      }

      if (errorType === "mapper_parsing_exception") {
        return {
          statusCode: 400,
          body: JSON.stringify({
            message: "Document structure doesn't match index mappings.",
            error: error.message,
            errorType,
            reason: error.meta.body.error.reason,
          }),
        };
      }
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Error processing event",
        error: error.message,
      }),
    };
  }
};
