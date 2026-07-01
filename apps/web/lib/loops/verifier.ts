import type { JobExecutionResult } from "@/lib/cron/types";
import type { StructuredExecutionOutput } from "@/lib/types/execution-result";
import type { LoopJson } from "./types";
import { loopVerificationSchema } from "./spec";

export interface LoopVerificationIssue {
  code:
    | "job_failed"
    | "missing_required_field"
    | "missing_required_source"
    | "missing_success_criteria"
    | "unknown_verification_type";
  message: string;
  severity: "error" | "warning";
}

export interface LoopVerificationEvidence {
  status: JobExecutionResult["status"];
  observedFields: string[];
  observedSources: string[];
  artifactCount: number;
  hasOutput: boolean;
  hasStructuredReport: boolean;
}

export interface LoopVerificationResult {
  type: "legacy_status" | "structured_check";
  passed: boolean;
  issues: LoopVerificationIssue[];
  evidence: LoopVerificationEvidence;
  checkedAt: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extractStructuredReport(
  result: JobExecutionResult,
): StructuredExecutionOutput | null {
  const resultData = asRecord(result.result);
  const report = resultData.structuredReport;
  return report && typeof report === "object"
    ? (report as StructuredExecutionOutput)
    : null;
}

function collectObservedFields(
  result: JobExecutionResult,
  structuredReport: StructuredExecutionOutput | null,
): string[] {
  const fields = new Set<string>();
  const resultData = asRecord(result.result);

  for (const key of Object.keys(resultData)) {
    fields.add(key);
  }

  if (result.output?.trim()) fields.add("output");
  if (result.error?.trim()) fields.add("error");

  if (structuredReport) {
    for (const key of Object.keys(structuredReport)) {
      fields.add(key);
    }
    if (structuredReport.summary?.trim()) fields.add("summary");
    if (structuredReport.outcome?.trim()) fields.add("outcome");
    if (structuredReport.reasoningChain?.length) fields.add("reasoningChain");
    if (structuredReport.files?.length) fields.add("files");
    if (structuredReport.suggestedActions?.length) {
      fields.add("suggestedActions");
    }
  }

  return [...fields].sort();
}

function collectObservedSources(
  result: JobExecutionResult,
  structuredReport: StructuredExecutionOutput | null,
): string[] {
  const sources = new Set<string>();
  const resultData = asRecord(result.result);
  const executionTrace = asRecord(resultData.executionTrace);
  const traceEvents = Array.isArray(executionTrace.events)
    ? executionTrace.events
    : [];
  const toolGate = asRecord(resultData.toolGate);
  const toolGateDecisions = Array.isArray(toolGate.decisions)
    ? toolGate.decisions
    : [];

  for (const step of structuredReport?.reasoningChain ?? []) {
    if (step.sourceType) sources.add(step.sourceType);
    if (step.sourceLabel) sources.add(step.sourceLabel);
  }

  for (const event of traceEvents) {
    const record = asRecord(event);
    if (typeof record.toolName === "string" && record.toolName.trim()) {
      sources.add(record.toolName);
      if (record.toolName.includes("__")) {
        sources.add(record.toolName.split("__").pop() ?? record.toolName);
      }
    }
  }

  for (const decision of toolGateDecisions) {
    const record = asRecord(decision);
    if (typeof record.actionName === "string" && record.actionName.trim()) {
      sources.add(record.actionName);
      if (record.actionName.includes("__")) {
        sources.add(record.actionName.split("__").pop() ?? record.actionName);
      }
    }
  }

  return [...sources].sort();
}

function countArtifacts(
  result: JobExecutionResult,
  structuredReport: StructuredExecutionOutput | null,
): number {
  const resultData = asRecord(result.result);
  let count = structuredReport?.files?.length ?? 0;
  if (typeof resultData.sessionDir === "string") count += 1;
  return count;
}

function hasField(observedFields: string[], required: string): boolean {
  const normalized = required.toLowerCase();
  return observedFields.some((field) => field.toLowerCase() === normalized);
}

function hasSource(observedSources: string[], required: string): boolean {
  const normalized = required.toLowerCase();
  return observedSources.some((source) => source.toLowerCase() === normalized);
}

export function verifyLoopRun(input: {
  verificationConfig: LoopJson;
  result: JobExecutionResult;
}): LoopVerificationResult {
  const config = loopVerificationSchema.parse(input.verificationConfig ?? {});
  const structuredReport = extractStructuredReport(input.result);
  const observedFields = collectObservedFields(input.result, structuredReport);
  const observedSources = collectObservedSources(input.result, structuredReport);
  const evidence: LoopVerificationEvidence = {
    status: input.result.status,
    observedFields,
    observedSources,
    artifactCount: countArtifacts(input.result, structuredReport),
    hasOutput: !!input.result.output?.trim(),
    hasStructuredReport: !!structuredReport,
  };

  const issues: LoopVerificationIssue[] = [];

  if (input.result.status !== "success") {
    issues.push({
      code: "job_failed",
      message:
        input.result.error || `Execution status was ${input.result.status}`,
      severity: "error",
    });
  }

  if (config.type === "legacy_status") {
    return {
      type: "legacy_status",
      passed: issues.length === 0,
      issues,
      evidence,
      checkedAt: new Date().toISOString(),
    };
  }

  for (const field of config.requiredFields) {
    if (!hasField(observedFields, field)) {
      issues.push({
        code: "missing_required_field",
        message: `Required field "${field}" was not observed`,
        severity: "error",
      });
    }
  }

  for (const source of config.requiredSources) {
    if (!hasSource(observedSources, source)) {
      issues.push({
        code: "missing_required_source",
        message: `Required source "${source}" was not observed`,
        severity: "error",
      });
    }
  }

  if (config.successCriteria.length > 0 && !input.result.output?.trim()) {
    issues.push({
      code: "missing_success_criteria",
      message: "Execution produced no output to evaluate success criteria",
      severity: "warning",
    });
  }

  return {
    type: "structured_check",
    passed: !issues.some((issue) => issue.severity === "error"),
    issues,
    evidence,
    checkedAt: new Date().toISOString(),
  };
}
