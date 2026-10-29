export function describeTimetableAvailability(overview) {
  const status = overview?.otherCollections?.find((item) => item?.name === "timetable_entries")?.status;
  if (status === "not_provisioned") {
    return {
      state: "unconfigured",
      title: "Timetable storage is not configured",
      detail: "The timetable_entries collection is not provisioned. No schedule data can be loaded.",
    };
  }
  if (status === "not_included") {
    return {
      state: "unavailable",
      title: "Timetable viewing is not available yet",
      detail: "The collection exists, but this backend does not provide a timetable listing API. No schedule entries have been queried.",
    };
  }
  return {
    state: "unknown",
    title: "Timetable availability could not be confirmed",
    detail: "The academic overview did not return a recognized timetable storage status. No schedule data is being shown.",
    showRetry: true,
  };
}

export function describeTimetableError(error) {
  if (error?.status === 401) {
    return {
      state: "unauthorized",
      title: "Sign in to check timetable availability",
      detail: "Return to the portal and sign in with an administrator account.",
      portalLinkText: "Go to portal sign in",
      showPortalLink: true,
    };
  }
  if (error?.status === 403) {
    return {
      state: "unauthorized",
      title: "Administrator access is required",
      detail: "This academic availability check is limited to administrators in the configured scope.",
      portalLinkText: "Return to portal",
      showPortalLink: true,
    };
  }
  if (error?.status === 404) {
    return {
      state: "unavailable",
      title: "The current backend does not provide the availability check",
      detail: "Restart the local backend with the current application version, then try again.",
      showRetry: true,
    };
  }
  return {
    state: "error",
    title: "Timetable availability could not be loaded",
    detail: "Check the local server connection and try again. No schedule entries have been loaded.",
    showRetry: true,
  };
}
