#!/usr/bin/env node

/**
 * Client Examples Index
 *
 * This script helps you discover and run available client examples.
 * Run without arguments to see all available examples.
 */

const examples = {
  compile: {
    name: "Compile Solidity",
    file: "compile.js",
    description: "Compile Solidity contracts using Remix compiler",
    cost: "0.01 USDC",
    script: "example:compile"
  },
  slither: {
    name: "Slither Security Analysis",
    file: "slither.js",
    description: "Run security analysis on Solidity contracts",
    cost: "0.02 USDC",
    script: "example:slither"
  },
  deploy: {
    name: "Deploy Contract (DDS)",
    file: "deploy.js",
    description: "Compile and deploy contracts using Delegated Deployment Service",
    cost: "0.05 USDC",
    script: "example:deploy"
  }
};

const clientKey = process.argv[2];

if (!clientKey || clientKey === "--help" || clientKey === "-h") {
  console.log("\n📦 Available Client Examples:\n");

  Object.entries(examples).forEach(([key, info]) => {
    console.log(`  ${key.padEnd(10)} - ${info.name}`);
    console.log(`  ${" ".repeat(13)} ${info.description}`);
    console.log(`  ${" ".repeat(13)} Cost: ${info.cost}`);
    console.log(`  ${" ".repeat(13)} Run: yarn run ${info.script}\n`);
  });

  console.log("Usage:");
  console.log("  node src/examples/index.js [client-name]");
  console.log("  yarn run example:[client-name]\n");

  console.log("Examples:");
  console.log("  yarn run example:compile");
  console.log("  yarn run example:deploy\n");

  process.exit(0);
}

const selectedClient = examples[clientKey];

if (!selectedClient) {
  console.error(`\n❌ Unknown example: ${clientKey}`);
  console.log("\nAvailable examples:", Object.keys(examples).join(", "));
  console.log("Run 'node src/examples/index.js' to see all options\n");
  process.exit(1);
}

console.log(`\n🚀 Running: ${selectedClient.name}`);
console.log(`   ${selectedClient.description}`);
console.log(`   Cost: ${selectedClient.cost}\n`);

// Dynamically import and run the selected client
import(`./${selectedClient.file}`).catch(err => {
  console.error(`\n❌ Error running example:`, err.message);
  process.exit(1);
});
