/**
 * Test script to reproduce the 1000+ line audit failure
 * Based on do-audit-example.js - saves full report
 */

import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the 1000+ line test contract
const contractPath = path.join(__dirname, 'test-contract-1000-lines.sol');
const TEST_CONTRACT = fs.readFileSync(contractPath, 'utf-8');

console.log(`Loaded test contract: ${TEST_CONTRACT.split('\n').length} lines, ${TEST_CONTRACT.length} characters`);

/**
 * Poll a job endpoint until completion
 */
async function pollJobUntilComplete(fetchFn, pollingUrl, pollIntervalMs = 5000, maxAttempts = 120) {
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;

    const response = await fetchFn(pollingUrl, {
      method: "GET",
      headers: {
        "Accept-Encoding": "gzip"
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Job polling failed: ${response.status} - ${errorText}`);
    }

    const jobStatus = await response.json();

    if (jobStatus.status === "completed") {
      console.log(`   ✅ Job completed after ${jobStatus.processingSeconds}s`);
      return jobStatus.result;
    } else if (jobStatus.status === "failed") {
      throw new Error(`Job failed: ${jobStatus.error}`);
    } else if (jobStatus.status === "pending" || jobStatus.status === "processing") {
      const elapsedSeconds = jobStatus.elapsedSeconds || 0;
      const dots = ".".repeat((attempts % 3) + 1);
      process.stdout.write(`\r   ⏳ ${jobStatus.status === "pending" ? "Queued" : "Processing"}${dots} (${elapsedSeconds}s elapsed)`);
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
  }

  throw new Error(`Job polling timed out after ${maxAttempts} attempts`);
}

async function main() {
  console.log("🔍 Testing Audit with 1000+ Line Contract");
  console.log("=".repeat(70));
  console.log();
  console.log("This test reproduces the issue where contracts between 600-1000 nSLOC");
  console.log("return empty audit reports marked as successful.");
  console.log();

  const selectedModel = 'Sonnet';  // Same model as in the report
  const doAuditEndpoint = "http://localhost:8002/do_audit";

  try {
    // Setup wallet and x402 client
    console.log("💰 Setting up x402 client with EVM signer...");
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("PRIVATE_KEY must be set in .env file");
    }

    const evmSigner = privateKeyToAccount(privateKey);
    console.log(`   Wallet address: ${evmSigner.address}`);

    const client = new x402Client();
    const exactScheme = new ExactEvmScheme(evmSigner);
    client.register("eip155:84532", exactScheme);

    const x402Fetch = wrapFetchWithPayment(fetch, client);
    console.log("   ✅ Payment-enabled fetch ready");

    // Prepare contract sources
    const sources = {
      "test-contract-1000-lines.sol": {
        content: TEST_CONTRACT
      }
    };

    console.log("\n" + "=".repeat(70));
    console.log("Testing /do_audit with 1000+ line contract");
    console.log("=".repeat(70));
    console.log();
    console.log("📊 Contract Stats:");
    console.log(`   Lines: ${TEST_CONTRACT.split('\n').length}`);
    console.log(`   Characters: ${TEST_CONTRACT.length}`);
    console.log(`   Model: ${selectedModel}`);
    console.log(`   Endpoint: ${doAuditEndpoint}`);
    console.log();

    const auditRequestBody = {
      model: selectedModel,
      sources: sources,
      checklist: `# Security Audit Checklist

## Basic Checks
- Check for reentrancy vulnerabilities
- Check for integer overflow/underflow
- Check for proper access control
- Check for unchecked external calls
- Check for DOS vulnerabilities`
    };

    console.log("🔄 Making audit request (with x402 payment)...");
    const startTime = Date.now();

    const auditResponse = await x402Fetch(doAuditEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip"
      },
      body: JSON.stringify(auditRequestBody)
    });

    console.log(`   Response status: ${auditResponse.status}`);

    if (!auditResponse.ok) {
      const errorText = await auditResponse.text();
      throw new Error(`Audit request failed: ${auditResponse.status} - ${errorText}`);
    }

    const auditResponseData = await auditResponse.json();

    let auditResult;

    if (auditResponse.status === 202) {
      console.log(`   ✅ Payment settled, job created: ${auditResponseData.jobId}`);

      let auditPollingUrl = auditResponseData.jobStatusUrl;
      if (auditPollingUrl && auditPollingUrl.includes('api.remix.live')) {
        const jobPath = `/job/${auditResponseData.jobId}`;
        auditPollingUrl = `http://localhost:8002${jobPath}`;
        console.log(`   📍 Polling URL (local): ${auditPollingUrl}`);
      }
      console.log();

      console.log("⏳ Polling for audit results...");
      auditResult = await pollJobUntilComplete(fetch, auditPollingUrl, 5000, 120);
      console.log();
    } else if (auditResponse.status === 200) {
      console.log(`   ✅ Payment settled, audit completed synchronously`);
      auditResult = auditResponseData;
    } else {
      throw new Error(`Unexpected response status: ${auditResponse.status}`);
    }

    const endTime = Date.now();
    const totalTime = ((endTime - startTime) / 1000).toFixed(1);

    console.log("\n" + "=".repeat(70));
    console.log("AUDIT RESULTS");
    console.log("=".repeat(70));
    console.log();
    console.log(`⏱️  Total Time: ${totalTime}s`);
    console.log(`📊 Total Findings: ${auditResult.findingsCount}`);
    console.log(`🤖 Model Used: ${auditResult.model}`);
    console.log(`💰 Tokens Used: ${auditResult.tokensUsed}`);
    console.log();

    if (auditResult.severity) {
      console.log("🎯 Severity Breakdown:");
      console.log(`   🔴 Critical: ${auditResult.severity.critical}`);
      console.log(`   🟠 High: ${auditResult.severity.high}`);
      console.log(`   🟡 Medium: ${auditResult.severity.medium}`);
      console.log(`   🟢 Low: ${auditResult.severity.low}`);
      console.log(`   ℹ️  Informational: ${auditResult.severity.informational}`);
      console.log();
    }

    // Check for the empty report issue
    const isEmpty = auditResult.findingsCount === 0 &&
                    (!auditResult.markdown || auditResult.markdown.includes("No summary provided"));

    if (isEmpty) {
      console.log("❌ ISSUE REPRODUCED!");
      console.log("   The audit returned 0 findings with an empty/template report.");
      console.log("   This is the bug we're testing for.");
      console.log();
      console.log("   With the fix, this should now return a failure status instead.");
    } else {
      console.log("✅ AUDIT SUCCESSFUL!");
      console.log("   The audit returned meaningful findings.");
    }

    // Save the full report
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const reportPath = path.join(__dirname, `audit-report-1000-lines-${timestamp}.md`);
    fs.writeFileSync(reportPath, auditResult.markdown || "No markdown report");

    console.log();
    console.log("=".repeat(70));
    console.log(`💾 Full report saved to: ${reportPath}`);
    console.log("=".repeat(70));

  } catch (error) {
    console.error("\n❌ Error:", error.message);
    if (error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
