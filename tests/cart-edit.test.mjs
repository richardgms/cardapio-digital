import assert from 'node:assert/strict';
import { test } from 'node:test';
import cart from '../src/stores/cartStore.ts';
const { useCartStore } = cart;
const line = observation => ({ product: { id: 'same-product', name: 'Lanche' }, quantity: 1, item_total: 14, selected_options: [], observation });

test('editar um lanche conserva a linha e os outros lanches do mesmo produto', () => {
  useCartStore.setState({ items: [] });
  useCartStore.getState().addItem(line('Sem cebola'));
  useCartStore.getState().addItem(line('Com cebola'));
  const [first, other] = useCartStore.getState().items;
  const replacement = { ...line('Molho à parte'), quantity: 2, item_total: 30, selected_options: [{ group_name: 'Extras', option_name: 'Queijo', price: 1 }] };
  useCartStore.getState().updateItem(first.id, replacement);
  const items = useCartStore.getState().items;
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], { ...replacement, id: first.id });
  assert.equal(items[1], other);
  useCartStore.getState().updateItem(first.id, { ...replacement, observation: 'Sem sal' });
  assert.equal(useCartStore.getState().items.length, 2);
  assert.equal(useCartStore.getState().items[0].id, first.id);
});

test('editar uma linha removida não recria nem adiciona um lanche', () => {
  useCartStore.setState({ items: [] });
  useCartStore.getState().addItem(line('Original'));
  const { id } = useCartStore.getState().items[0];
  useCartStore.getState().removeItem(id);
  useCartStore.getState().updateItem(id, line('Alterado'));
  assert.deepEqual(useCartStore.getState().items, []);
});

test('uma edição substitui as opções e remove o meio a meio anterior', () => {
  useCartStore.setState({ items: [] });
  useCartStore.getState().addItem({ ...line('Anterior'), half_half: { enabled: true, first_half: 'A', second_half: 'B', final_price: 14 } });
  const { id } = useCartStore.getState().items[0];
  useCartStore.getState().updateItem(id, line(''));
  assert.equal(useCartStore.getState().items[0].half_half, undefined);
  assert.equal(useCartStore.getState().items[0].observation, '');
});
