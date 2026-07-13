class MenuRequirementNotFoundError(ValueError):
    """The requested menu requirement does not exist."""


class MenuRequirementAccessDeniedError(ValueError):
    """Current user cannot access the requested menu requirement."""


class MenuRequirementValidationError(ValueError):
    """The daily menu cannot be converted into a menu requirement."""
