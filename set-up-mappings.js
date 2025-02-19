/**
 * OpenSearch Index Setup Script
 *
 * This script creates an index with predefined mappings in an OpenSearch serverless collection.
 */

const { Client } = require("@opensearch-project/opensearch");
const { AwsCredentialProvider } = require("@opensearch-project/opensearch/aws");
const AWS = require("aws-sdk");
require("dotenv").config(); // For loading environment variables from .env file
import { indexMappings } from "./mappings";

// Validate required environment variables
const requiredEnvVars = ["OPENSEARCH_ENDPOINT", "AWS_REGION"];
const missingEnvVars = requiredEnvVars.filter(
  (varName) => !process.env[varName],
);
if (missingEnvVars.length > 0) {
  console.error(
    `Error: Missing required environment variables: ${missingEnvVars.join(", ")}`,
  );
  process.exit(1);
}

// Configuration - you can override these with environment variables
const config = {
  indexName: process.env.OPENSEARCH_INDEX || "arc-content",
  endpoint: process.env.OPENSEARCH_ENDPOINT,
  region: process.env.AWS_REGION,
  forceRecreate: process.env.FORCE_RECREATE === "true" || false,
};

console.log("Using configuration:", {
  indexName: config.indexName,
  endpoint: config.endpoint,
  region: config.region,
  forceRecreate: config.forceRecreate,
});

// Initialize OpenSearch client with AWS credentials
const getClient = () => {
  console.log(`Connecting to OpenSearch endpoint: ${config.endpoint}`);

  // Create AWS credential provider
  const awsCredentials = new AWS.EnvironmentCredentials("AWS");
  const awsCredentialProvider = new AwsCredentialProvider({
    credentials: awsCredentials,
  });

  // Create the client with AWS Auth
  const client = new Client({
    node: config.endpoint,
    ssl: { rejectUnauthorized: true },
    region: config.region,
    auth: {
      type: "aws",
      credentials: awsCredentialProvider,
    },
  });

  return client;
};

/**
 * Tests the connection to OpenSearch
 */
async function testConnection(client) {
  try {
    console.log("Testing connection to OpenSearch...");
    const response = await client.cluster.health({});
    console.log("Connection successful! Cluster status:", response.body.status);
    return true;
  } catch (error) {
    console.error("Connection test failed:", error.message);
    console.error(
      "Make sure your AWS credentials are configured correctly and you have access to the OpenSearch collection",
    );
    if (error.meta && error.meta.body) {
      console.error(
        "OpenSearch error details:",
        JSON.stringify(error.meta.body, null, 2),
      );
    } else {
      console.error("Full error:", error);
    }
    return false;
  }
}

/**
 * Creates or updates the index with mappings
 */
async function setupIndex() {
  try {
    const client = getClient();

    // First test the connection
    const connectionSuccessful = await testConnection(client);
    if (!connectionSuccessful) {
      process.exit(1);
    }

    // Check if index exists
    console.log(`Checking if index '${config.indexName}' exists...`);
    const indexExists = await client.indices.exists({
      index: config.indexName,
    });

    if (indexExists.body) {
      console.log(`Index '${config.indexName}' already exists`);

      if (config.forceRecreate) {
        console.log(
          `Force recreate flag is set. Deleting index '${config.indexName}'...`,
        );
        await client.indices.delete({
          index: config.indexName,
        });
        console.log(`Index '${config.indexName}' deleted`);

        // Create new index with mappings
        console.log(
          `Creating new index '${config.indexName}' with mappings...`,
        );
        await client.indices.create({
          index: config.indexName,
          body: indexMappings,
        });
        console.log(
          `Successfully created index '${config.indexName}' with mappings`,
        );
      } else {
        // Update existing mappings
        console.log(
          `Updating mappings for existing index '${config.indexName}'...`,
        );
        try {
          await client.indices.putMapping({
            index: config.indexName,
            body: indexMappings.mappings,
          });
          console.log(
            `Successfully updated mappings for index '${config.indexName}'`,
          );
        } catch (mappingError) {
          console.error("Error updating mappings:", mappingError.message);
          console.error(
            "Some mapping changes may not be compatible with existing data.",
          );
          console.error(
            "If you need to completely rebuild the index, run this script with FORCE_RECREATE=true",
          );
          throw mappingError;
        }
      }
    } else {
      // Create new index with mappings
      console.log(`Creating new index '${config.indexName}' with mappings...`);
      await client.indices.create({
        index: config.indexName,
        body: indexMappings,
      });
      console.log(
        `Successfully created index '${config.indexName}' with mappings`,
      );
    }

    // Verify the mappings
    console.log("Verifying mappings...");
    const mappings = await client.indices.getMapping({
      index: config.indexName,
    });

    console.log("Current mappings:");
    console.log(JSON.stringify(mappings.body, null, 2));

    return {
      success: true,
      message: `Index '${config.indexName}' setup complete!`,
    };
  } catch (error) {
    console.error("Error setting up index:", error.message);
    if (error.meta && error.meta.body) {
      console.error(
        "OpenSearch error details:",
        JSON.stringify(error.meta.body, null, 2),
      );
    }
    return {
      success: false,
      error: error.message,
    };
  }
}

console.log("Starting OpenSearch index setup...");
setupIndex()
  .then((result) => {
    if (result.success) {
      console.log(result.message);
      console.log("Your index is ready to use with your Lambda function.");
    } else {
      console.error("Failed to set up index:", result.error);
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
