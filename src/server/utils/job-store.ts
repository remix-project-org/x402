/**
 * In-memory job store for async audit processing
 *
 * This allows audit endpoints to return immediately with a job ID,
 * while processing continues in the background. Clients can poll
 * for results without timing out.
 */

import { randomUUID } from "crypto";

export interface AuditJob {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: number;
  completedAt?: number;
  result?: any;
  error?: string;
  endpoint: string; // "/get_audit_checklist" or "/do_audit"
  model: string;
  pollingUrl: string;
}

// In-memory store (can be replaced with Redis for production)
const jobs = new Map<string, AuditJob>();

// Job expiration times
const JOB_EXPIRATION_MS = 10 * 60 * 1000; // 10 minutes
const COMPLETED_JOB_RETENTION_MS = 5 * 60 * 1000; // Keep completed jobs for 5 minutes

/**
 * Create a new audit job and return its ID
 */
export function createJob(endpoint: string, model: string, baseUrl: string): AuditJob {
  const jobId = randomUUID();
  const pollingUrl = `${baseUrl}/job/${jobId}`;

  const job: AuditJob = {
    id: jobId,
    status: "pending",
    createdAt: Date.now(),
    endpoint,
    model,
    pollingUrl
  };

  jobs.set(jobId, job);
  console.log(`📋 Created job ${jobId} for ${endpoint} with model ${model}`);

  return job;
}

/**
 * Update job status to processing
 */
export function markJobAsProcessing(jobId: string): void {
  const job = jobs.get(jobId);
  if (job) {
    job.status = "processing";
    console.log(`⚙️  Job ${jobId} marked as processing`);
  }
}

/**
 * Complete a job with results
 */
export function completeJob(jobId: string, result: any): void {
  const job = jobs.get(jobId);
  if (job) {
    job.status = "completed";
    job.completedAt = Date.now();
    job.result = result;
    console.log(`✅ Job ${jobId} completed successfully`);
  }
}

/**
 * Fail a job with error
 */
export function failJob(jobId: string, error: string): void {
  const job = jobs.get(jobId);
  if (job) {
    job.status = "failed";
    job.completedAt = Date.now();
    job.error = error;
    console.log(`❌ Job ${jobId} failed: ${error}`);
  }
}

/**
 * Get job by ID
 */
export function getJob(jobId: string): AuditJob | undefined {
  return jobs.get(jobId);
}

/**
 * Delete job from store (after retrieval or expiration)
 */
export function deleteJob(jobId: string): void {
  const job = jobs.get(jobId);
  if (job) {
    jobs.delete(jobId);
    console.log(`🗑️  Deleted job ${jobId}`);
  }
}

/**
 * Cleanup expired jobs
 * - Remove pending/processing jobs older than JOB_EXPIRATION_MS
 * - Remove completed/failed jobs older than COMPLETED_JOB_RETENTION_MS
 */
export function cleanupExpiredJobs(): void {
  const now = Date.now();
  let cleaned = 0;

  for (const [jobId, job] of jobs.entries()) {
    const age = now - job.createdAt;

    if (job.status === "completed" || job.status === "failed") {
      // Cleanup completed/failed jobs after retention period
      if (job.completedAt && (now - job.completedAt) > COMPLETED_JOB_RETENTION_MS) {
        jobs.delete(jobId);
        cleaned++;
      }
    } else {
      // Cleanup stuck pending/processing jobs after expiration
      if (age > JOB_EXPIRATION_MS) {
        jobs.delete(jobId);
        cleaned++;
      }
    }
  }

  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} expired jobs (${jobs.size} remaining)`);
  }
}

/**
 * Get job statistics
 */
export function getJobStats() {
  const stats = {
    total: jobs.size,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0
  };

  for (const job of jobs.values()) {
    stats[job.status]++;
  }

  return stats;
}

// Run cleanup every minute
setInterval(cleanupExpiredJobs, 60 * 1000);
