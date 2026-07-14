import "server-only";

/**
 * Thin ClickUp REST API client. Isolated from the rest of the app: callers
 * go through sync.ts wrappers, which catch failures so a ClickUp outage
 * never breaks ProofFlow workflows.
 */

const BASE_URL = "https://api.clickup.com/api/v2";

export class ClickUpApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
      ...init.headers,
    },
    // ClickUp can be slow; don't hold requests forever.
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ClickUpApiError(res.status, `ClickUp ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export interface ClickUpTask {
  id: string;
  name: string;
  url: string;
  status: { status: string } | null;
  assignees: { username: string }[];
  due_date: string | null;
}

export const clickUpApi = {
  getTask(token: string, taskId: string) {
    return request<ClickUpTask>(token, `/task/${taskId}`);
  },

  updateTask(
    token: string,
    taskId: string,
    body: { status?: string; due_date?: number }
  ) {
    return request<ClickUpTask>(token, `/task/${taskId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },

  addComment(token: string, taskId: string, commentText: string) {
    return request<{ id: string }>(token, `/task/${taskId}/comment`, {
      method: "POST",
      body: JSON.stringify({ comment_text: commentText }),
    });
  },

  getWorkspaces(token: string) {
    return request<{ teams: { id: string; name: string }[] }>(token, "/team");
  },

  createWebhook(token: string, workspaceId: string, endpoint: string) {
    return request<{ id: string; webhook: { id: string } }>(
      token,
      `/team/${workspaceId}/webhook`,
      {
        method: "POST",
        body: JSON.stringify({
          endpoint,
          events: ["taskUpdated", "taskStatusUpdated", "taskAssigneeUpdated"],
        }),
      }
    );
  },
};
