import { getApiErrorMessage } from "@/shared/api/HttpClient";

type RequestErrorProps = {
  error: unknown;
  onRetry?: () => void;
};

export function RequestError({ error, onRetry }: RequestErrorProps) {
  return (
    <div
      role="alert"
      className="nf-error"
    >
      <p>{getApiErrorMessage(error)}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="nf-button mt-3"
        >
          Повторити
        </button>
      ) : null}
    </div>
  );
}
