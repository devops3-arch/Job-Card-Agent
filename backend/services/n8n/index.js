import dotenv from "dotenv";

dotenv.config();

const WEBHOOK_URL = process.env.N8N_JOB_APPROVAL_WEBHOOK_URL || process.env.N8N_WEBHOOK_URL;

export const triggerN8nWorkflow = async (workflowName, payload) => {
  if (!WEBHOOK_URL) {
    return {
      success: false,
      message: "n8n webhook URL is not configured",
      workflowName,
      payload,
    };
  }

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ workflowName, payload, source: "job-card-agent" }),
    });

    const text = await response.text();
    let responseBody = null;
    try {
      responseBody = text ? JSON.parse(text) : null;
    } catch {
      responseBody = text;
    }

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        message: `n8n webhook returned ${response.status}`,
        workflowName,
        payload,
        response: responseBody,
      };
    }

    return {
      success: true,
      message: "n8n workflow triggered successfully",
      workflowName,
      payload,
      response: responseBody,
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to reach n8n webhook: ${err.message}`,
      workflowName,
      payload,
      error: err.message,
    };
  }
};
