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

const handleComposerEvent = async (event, opensearchClient) => {
  const { type: eventType, payload: ansObject } = event;
  const indexName = process.env.OPENSEARCH_INDEX;

  switch (eventType) {
    case "story.update":
    case "story.publish": {
      if (!ansObject || !ansObject._id) {
        throw new Error("Invalid ANS object: missing _id field");
      }

      // new copy of object without content_elements
      const { content_elements, ...ansToIndex } = ansObject;
      console.log(
        `Preparing to index document ${ansObject._id} without content_elements`,
      );

      await opensearchClient.index({
        index: indexName,
        id: ansObject._id,
        body: ansToIndex,
        refresh: true,
      });

      console.log(`Indexed document with ID ${ansObject._id}`);
      return { status: "success", operation: "index", id: ansObject._id };
    }

    case "story.unpublish":
    case "story.delete": {
      if (!ansObject || !ansObject._id) {
        throw new Error(
          "Invalid ANS object for delete operation: missing _id field",
        );
      }

      await opensearchClient.delete({
        index: indexName,
        id: ansObject._id,
        refresh: true,
      });

      console.log(`Deleted document with ID ${ansObject._id}`);
      return { status: "success", operation: "delete", id: ansObject._id };
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

    if (
      error.meta &&
      error.meta.body &&
      error.meta.body.error &&
      error.meta.body.error.type === "index_not_found_exception"
    ) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          message:
            "Index does not exist. Please create the index before processing events.",
          error: error.message,
        }),
      };
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
