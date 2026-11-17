/* Sums in the pricing cells: the arithmetic, the labels, the breakdown. */
import { evaluate, isFormula, breakdown, breakdownText, cellValue } from '../web/calc.js';

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('  - ' + msg); } };
const v = (s) => evaluate(s).value;

check(v('500') === 500 && !isFormula('500') && !isFormula(' 12.5 ') && !isFormula(''), 'a plain number is a number, not a formula');
check(v('500+250*2+300') === 1300 && isFormula('500+250*2+300'), 'precedence: × before +');
check(v('(500+250)*2') === 1500, 'brackets');
check(v('1,500 + 2,250.5') === 3750.5, 'thousands commas');
check(v('٥٠٠ + ٢٥٠') === 750 && v('١٬٥٠٠') === 1500 && v('١٢٫٥') === 12.5, 'Arabic digits, thousands and decimal marks');
check(v('250×2') === 500 && v('250 x 2') === 500 && v('1000÷4') === 250 && v('100 − 30') === 70, '× x ÷ and the long minus');
check(v('2000 + 15%') === 2000.15 && v('2000 * 115%') === 2300, 'percent is ÷ 100 (so "* 115%" adds 15%)');
check(v('-50 + 100') === 50 && v('10/3') === 3.3333, 'unary minus; rounding to 4 decimals');
check(v('خشب 500 + دهان 250×2 + تركيب 300') === 1300, 'Arabic labels are ignored by the arithmetic');
check(v('wood 500 + paint 250 x 2 + fitting 300') === 1300, 'English labels too, and "x" before a number is ×');
check(isFormula('خشب 500'), 'a labelled number counts as a formula (it has something to show)');
check(evaluate('500 250').error === 'missingOp' && evaluate('500 wood 250').error === 'missingOp', 'two numbers with no operator: an error, not a guess');
check(evaluate('100/0').error === 'divZero' && evaluate('5+').error === 'syntax' && evaluate('(5+1').error === 'syntax', 'errors are reported');
check(evaluate('wood').error === 'empty' && cellValue('') === null, 'no number at all');
check(v('1..2') === null, 'a stray dot is an error');
check(v('constructor') === null && v('alert(1)') === 1, 'nothing is executed: words are just labels');

const b = breakdown('خشب 500 + دهان 250×2 - خصم 100');
check(b.length === 3 && b[0].label === 'خشب 500' && b[0].value === 500 && b[1].label === 'دهان 250×2' && b[1].value === 500
  && b[2].sign === '-' && b[2].value === 100, `breakdown parts: ${JSON.stringify(b)}`);
check(breakdown('(100+50)*2 + 10').length === 2, 'a bracket is one part');
const t = breakdownText('wood 500 + paint 250x2 + fitting 300', { totalLabel: 'Total', qty: 3 });
check(t === 'wood 500  =  500\npaint 250x2  =  500\nfitting 300  =  300\nTotal: 1,300\n× 3 = 3,900', `hover text:\n${t}`);
check(breakdownText('500') === '' && breakdownText('5+') === '', 'nothing to show for a plain number or a broken sum');
check(breakdownText('100 + 200').startsWith('100\n200\nTotal: 300'), 'bare numbers are not repeated as "= n"');

if (failed) { console.log(`calc: ${failed} failed`); process.exit(1); }
console.log('calc: ok');
