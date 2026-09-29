const { buildLeadExportFilter } = require('../../utils/leadExportFilter');

describe('buildLeadExportFilter', () => {
  it('applies Customer + LOAN filters for Loans export', () => {
    const filter = buildLeadExportFilter(
      { status: 'Customer', paymentMethod: 'LOAN', bank: 'SBI' },
      { status: 'Customer' },
    );
    expect(filter.status).toBe('Customer');
    expect(filter.paymentMethod).toBe('LOAN');
    expect(filter.bank).toBe('SBI');
  });

  it('applies search and date range', () => {
    const filter = buildLeadExportFilter({
      search: 'Ravi',
      'createdAt[gte]': '2026-01-01T00:00:00.000Z',
      'createdAt[lte]': '2026-12-31T23:59:59.999Z',
    });
    expect(filter.customerName.$regex).toBe('Ravi');
    expect(filter.createdAt.$gte).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });
});
