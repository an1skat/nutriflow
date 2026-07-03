export type PageRequest = {
  offset: number;
  limit: number;
};

export function toApiPaginationParams(request: PageRequest) {
  return {
    offset: request.offset,
    limit: request.limit,
  };
}
