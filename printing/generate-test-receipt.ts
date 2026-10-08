import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderOrderReceipt } from '../src/lib/order-receipt';

const root = path.dirname(fileURLToPath(import.meta.url));
const width = process.argv[2] ?? '80';
if (width !== '80' && width !== '58') throw new Error('Use 80 ou 58 mm');
const document = JSON.parse(fs.readFileSync(path.join(root, 'fixtures', 'receipt-test-v1.json'), 'utf8'));
// Ensaio isolado: nenhum .env, conexão, pedido real ou credencial.
if (document.snapshot.order.customer_phone !== '00000000000' || !document.snapshot.order.customer_name.includes('FICTÍCIO')) {
    throw new Error('Fixture deve ser explicitamente fictícia');
}
const text = renderOrderReceipt(document, width === '80' ? 42 : 32, true);
const outputDirectory = path.join(root, '.local');
fs.mkdirSync(outputDirectory, { recursive: true });
const output = path.join(outputDirectory, `receipt-test-${width}mm.txt`);
fs.writeFileSync(output, text, 'utf8');
console.log(`Recibo fictício gerado, sem imprimir: ${output}`);
