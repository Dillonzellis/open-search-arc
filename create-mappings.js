import "dotenv/config";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { createHash } from "crypto";
import { Mappings } from "./mappings.js";

// Get environment variables
const REGION = process.env.AWS_REGION;
const OPENSEARCH_ENDPOINT = process.env.OPENSEARCH_ENDPOINT;
const INDEX_NAME = process.env.INDEX_NAME;

// Validate required environment variables
if (!REGION || !OPENSEARCH_ENDPOINT || !INDEX_NAME) {
  console.error(
    "Missing required environment variables. Please check your .env file.",
  );
  console.error(
    "Required variables: AWS_REGION, OPENSEARCH_ENDPOINT, INDEX_NAME",
  );
  process.exit(1);
}

// Create a request signer
const signer = new SignatureV4({
  credentials: defaultProvider(),
  region: REGION,
  service: "aoss",
  sha256: createHash.bind(null, "sha256"),
});

async function createIndexWithMappings() {
  try {
    const url = `${OPENSEARCH_ENDPOINT}/${INDEX_NAME}`;
    const body = JSON.stringify(Mappings);

    // Prepare headers for signing
    const headers = {
      "Content-Type": "application/json",
      Host: new URL(OPENSEARCH_ENDPOINT).host,
    };

    console.log(`Creating index '${INDEX_NAME}' with mappings...`);

    // Sign the request
    const signedRequest = await signer.sign({
      method: "PUT",
      headers,
      path: `/${INDEX_NAME}`,
      body,
      hostname: new URL(OPENSEARCH_ENDPOINT).host,
    });

    // Make the request with native fetch
    const response = await fetch(url, {
      method: "PUT",
      headers: signedRequest.headers,
      body,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`HTTP error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    console.log("Index created successfully with mappings:");
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error creating index with mappings:");
    console.error(error.message || error);
  }
}

// Run the function
createIndexWithMappings();
