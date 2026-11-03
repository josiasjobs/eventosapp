/**
 * EventosAPP - Nome da mídia importada de um .jwlplaylist
 * Acrescenta ao nome as regras do JW Library que o operador precisa ver:
 * "Editado" (item com corte) e a ação de fim quando não é a padrão.
 */
const END_ACTIONS = { 0: 'Continuar', 1: 'Repetir' };

function playlistMediaTitle(name, row) {
  const tags = [];
  if (Number(row.StartTrimOffsetTicks) || Number(row.EndTrimOffsetTicks)) tags.push('Editado');
  const action = END_ACTIONS[row.EndAction];
  if (action) tags.push(action);
  return [name, ...tags.map(t => `"${t}"`)].join(' - ');
}

module.exports = { playlistMediaTitle };
