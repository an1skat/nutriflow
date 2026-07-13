import axios, { type AxiosRequestConfig } from "axios";

import { apiClient } from "./HttpClient";

export type DownloadedFile = {
  blob: Blob;
  filename: string;
};

export async function downloadFile(
  url: string,
  fallbackFilename: string,
  config?: AxiosRequestConfig,
): Promise<DownloadedFile> {
  try {
    const response = await apiClient.get<Blob>(url, {
      ...config,
      responseType: "blob",
    });
    return {
      blob: response.data,
      filename: extractDownloadFilename(
        response.headers["content-disposition"],
        fallbackFilename,
      ),
    };
  } catch (error) {
    return normalizeBlobApiError(error);
  }
}

export function triggerFileDownload(file: DownloadedFile): void {
  const url = URL.createObjectURL(file.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function extractDownloadFilename(
  contentDisposition: string | undefined,
  fallback: string,
): string {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      return utf8Match[1].trim();
    }
  }

  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1]?.trim() || fallback;
}

async function normalizeBlobApiError(error: unknown): Promise<never> {
  if (
    axios.isAxiosError(error) &&
    error.response?.data instanceof Blob &&
    error.response.data.size > 0
  ) {
    const text = await error.response.data.text();
    try {
      error.response.data = JSON.parse(text) as unknown;
    } catch {
      error.response.data = { detail: text };
    }
  }
  throw error;
}
