'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { closed } = require('../scripts/restaurants-routine.js');

test('closed: past-tense Wikipedia intros and permanent closures are left out', () => {
  assert.equal(closed('Maude was a Michelin-starred restaurant by Curtis Stone, serving California cuisine in Beverly Hills.\nMaude closed in September 2024.'), true);
  assert.equal(closed('Le Gavroche (The Urchin) was a restaurant at 43 Upper Brook Street in Mayfair, London.'), true);
  assert.equal(closed('The Raby Hunt is a restaurant in Summerhouse. It closed permanently at the end of January 2024.'), true);
  assert.equal(closed('The Fat Duck is a restaurant in Bray. It lost its stars in 2016 when it closed for renovation, but regained all three the following year.'), false);
  assert.equal(closed('Masa is a sushi restaurant in New York. In 2009, a second Bar Masa opened inside Aria in Las Vegas which closed in 2018.'), false);
  assert.equal(closed(''), false);
  assert.equal(closed(undefined), false);
});
