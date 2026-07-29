const paginate = (query, req, defaultLimit = 20) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || defaultLimit, 100);
  const skip = (page - 1) * limit;

  return {
    query: query.skip(skip).limit(limit),
    pagination: {
      page,
      limit,
      skip,
    },
  };
};

module.exports = paginate;
