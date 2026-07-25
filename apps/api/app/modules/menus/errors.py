class MenuNotFoundError(ValueError):
    """The requested menu does not exist."""


class MenuAccessDeniedError(ValueError):
    """Current user cannot access the requested menu."""


class MenuValidationError(ValueError):
    """Menu payload violates a domain rule."""


class MenuVersionConflictError(ValueError):
    """The menu was changed after the client loaded it."""


class MenuImportError(ValueError):
    """Menu import file cannot be parsed into a weekly menu."""
