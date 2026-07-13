from fastapi import HTTPException, status


def not_found(exc: ValueError) -> HTTPException:
    return _http_error(status.HTTP_404_NOT_FOUND, exc)


def forbidden(exc: ValueError) -> HTTPException:
    return _http_error(status.HTTP_403_FORBIDDEN, exc)


def bad_request(exc: ValueError) -> HTTPException:
    return _http_error(status.HTTP_400_BAD_REQUEST, exc)


def conflict(exc: ValueError) -> HTTPException:
    return _http_error(status.HTTP_409_CONFLICT, exc)


def _http_error(status_code: int, exc: ValueError) -> HTTPException:
    return HTTPException(status_code=status_code, detail=str(exc))
