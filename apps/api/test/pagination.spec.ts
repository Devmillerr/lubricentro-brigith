import { paginate } from '../src/common/pagination';

describe('paginate', () => {
  it('devuelve todos los elementos y nextCursor nulo cuando hay menos que el límite', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    expect(paginate(rows, 20)).toEqual({ items: rows, nextCursor: null });
  });

  it('recorta al límite y devuelve el id del último como nextCursor cuando sobra una fila', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(paginate(rows, 2)).toEqual({
      items: [{ id: 'a' }, { id: 'b' }],
      nextCursor: 'b',
    });
  });

  it('nextCursor es nulo cuando el número de filas es exactamente el límite', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    expect(paginate(rows, 2)).toEqual({ items: rows, nextCursor: null });
  });
});
