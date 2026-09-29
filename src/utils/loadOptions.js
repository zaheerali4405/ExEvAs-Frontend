// Fetches one dropdown's options for a page, if the viewer may read them. A
// forbidden or failed lookup leaves that dropdown empty rather than failing
// the page. isStale is asked before storing, so a response that lands after
// the effect was cleaned up is dropped.
export function loadOptions(allowed, request, onLoad, isStale) {
  if (!allowed) return;
  request()
    .then(({ data }) => {
      if (!isStale()) onLoad(data);
    })
    .catch(() => {});
}
