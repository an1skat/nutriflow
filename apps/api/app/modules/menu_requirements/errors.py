from collections.abc import Iterable
from datetime import date as Date


class MenuRequirementNotFoundError(ValueError):
    """The requested menu requirement does not exist."""


class MenuRequirementAccessDeniedError(ValueError):
    """Current user cannot access the requested menu requirement."""


class MenuRequirementValidationError(ValueError):
    """Menu requirement data or report parameters are invalid."""


class MenuRequirementRangeIncompleteError(MenuRequirementValidationError):
    """The selected report range contains missing or stale menu requirements."""

    def __init__(
        self,
        *,
        missing_dates: Iterable[Date] = (),
        stale_dates: Iterable[Date] = (),
    ) -> None:
        self.missing_dates = tuple(sorted(set(missing_dates)))
        self.stale_dates = tuple(sorted(set(stale_dates)))

        details: list[str] = []
        if self.missing_dates:
            details.append(
                "missing dates: "
                + ", ".join(service_date.isoformat() for service_date in self.missing_dates)
            )
        if self.stale_dates:
            details.append(
                "stale dates: "
                + ", ".join(service_date.isoformat() for service_date in self.stale_dates)
            )

        message = "Menu requirement report cannot be generated"
        if details:
            message = f"{message}; {'; '.join(details)}"

        super().__init__(message)
