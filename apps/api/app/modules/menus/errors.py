class MenuNotFoundError(ValueError):
    """The requested menu does not exist."""


class MenuAccessDeniedError(ValueError):
    """Current user cannot access the requested menu."""


class MenuValidationError(ValueError):
    """Menu payload violates a domain rule."""


class MenuVersionConflictError(ValueError):
    """The menu was changed after the client loaded it."""


class AssignmentConflictError(MenuVersionConflictError):
    def __init__(self, conflicts: list[dict]):
        super().__init__("На цей тиждень уже призначено інше меню")
        self.conflicts = conflicts


class MenuImportError(ValueError):
    """Menu import file cannot be parsed into a weekly menu."""
