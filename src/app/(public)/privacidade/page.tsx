import Link from 'next/link'
import { Layout } from 'lucide-react'

export const metadata = {
    title: 'Política de Privacidade | RMenu',
    description: 'Saiba como o RMenu coleta, usa e protege seus dados pessoais.',
}

export default function PrivacidadePage() {
    return (
        <div className="min-h-screen bg-white">
            {/* Header simples */}
            <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
                <div className="container mx-auto px-4 h-16 flex items-center">
                    <Link href="/" className="flex items-center gap-2 font-bold text-xl text-primary">
                        <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center text-white">
                            <Layout className="h-5 w-5" />
                        </div>
                        RMenu
                    </Link>
                </div>
            </header>

            <main className="container mx-auto px-4 py-12 max-w-3xl">
                <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Política de Privacidade</h1>
                <p className="text-sm text-gray-500 mb-10">Última atualização: março de 2026</p>

                <div className="space-y-8 text-gray-700 leading-relaxed">

                    <section>
                        <h2 className="text-xl font-bold text-gray-900 mb-3">1. Quem somos</h2>
                        <p>
                            O <strong>RMenu</strong> é uma plataforma de cardápio digital que permite a restaurantes e
                            estabelecimentos alimentícios criar um menu online e receber pedidos via WhatsApp.
                            Os cardápios ficam disponíveis em subdomínios do tipo{' '}
                            <span className="font-mono text-sm bg-gray-100 px-1 rounded">sualoja.rmenu.com.br</span>.
                        </p>
                        <p className="mt-2">
                            Para esta Política de Privacidade, considera-se:
                        </p>
                        <ul className="list-disc pl-6 mt-2 space-y-1">
                            <li><strong>Controlador:</strong> o estabelecimento dono do cardápio que você está acessando.</li>
                            <li><strong>Operador:</strong> RMenu, responsável pela plataforma tecnológica.</li>
                            <li><strong>Titular:</strong> você, consumidor que acessa e realiza pedidos.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-gray-900 mb-3">2. Dados que coletamos</h2>
                        <p>Coletamos apenas os dados necessários para o funcionamento do serviço:</p>

                        <h3 className="font-semibold text-gray-800 mt-4 mb-2">Dados fornecidos por você</h3>
                        <ul className="list-disc pl-6 space-y-1">
                            <li><strong>Nome</strong> — para identificação no pedido.</li>
                            <li><strong>Número de telefone (WhatsApp)</strong> — para contato do estabelecimento sobre o pedido.</li>
                            <li><strong>Endereço de entrega</strong> (quando aplicável) — para cálculo do frete e entrega.</li>
                        </ul>

                        <h3 className="font-semibold text-gray-800 mt-4 mb-2">Dados coletados automaticamente</h3>
                        <ul className="list-disc pl-6 space-y-1">
                            <li><strong>Itens do carrinho e preferências de pedido</strong> — salvos localmente no seu dispositivo.</li>
                            <li><strong>Dados técnicos de navegação</strong> — como identificação do subdomínio da loja, gerenciados pelos servidores de forma automática.</li>
                        </ul>

                        <p className="mt-3 text-sm bg-gray-50 border border-gray-200 rounded-lg p-3">
                            Não coletamos dados de cartão de crédito, CPF, RG ou qualquer dado sensível definido pela LGPD.
                            Pagamentos em dinheiro, Pix ou outras formas ocorrem diretamente entre você e o estabelecimento.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-gray-900 mb-3">3. Cookies e armazenamento local</h2>
                        <p>
                            Utilizamos <strong>cookies</strong> (pequenos arquivos salvos no navegador) e{' '}
                            <strong>armazenamento local</strong> (localStorage) para as seguintes finalidades:
                        </p>

                        <div className="mt-4 overflow-x-auto">
                            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="text-left px-4 py-3 font-semibold text-gray-700 border-b">Nome</th>
                                        <th className="text-left px-4 py-3 font-semibold text-gray-700 border-b">Tipo</th>
                                        <th className="text-left px-4 py-3 font-semibold text-gray-700 border-b">Finalidade</th>
                                        <th className="text-left px-4 py-3 font-semibold text-gray-700 border-b">Duração</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    <tr>
                                        <td className="px-4 py-3 font-mono text-xs">cardapio-cart</td>
                                        <td className="px-4 py-3">localStorage</td>
                                        <td className="px-4 py-3">Salva os itens do seu carrinho de compras entre visitas</td>
                                        <td className="px-4 py-3">Persistente</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-3 font-mono text-xs">rmenu_customer_data</td>
                                        <td className="px-4 py-3">localStorage</td>
                                        <td className="px-4 py-3">Preenche automaticamente seus dados (nome, telefone, endereço) em futuros pedidos</td>
                                        <td className="px-4 py-3">Persistente</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-3 font-mono text-xs">subdomain</td>
                                        <td className="px-4 py-3">Cookie</td>
                                        <td className="px-4 py-3">Identifica qual loja você está acessando (técnico, necessário)</td>
                                        <td className="px-4 py-3">Sessão</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-3 font-mono text-xs">sb-* (Supabase)</td>
                                        <td className="px-4 py-3">Cookie</td>
                                        <td className="px-4 py-3">Autenticação segura dos administradores das lojas (não afeta consumidores)</td>
                                        <td className="px-4 py-3">7 dias</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <p className="mt-4">
                            Não utilizamos cookies de rastreamento, publicidade ou análise de comportamento (como Google Analytics).
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-gray-900 mb-3">4. Para que usamos seus dados</h2>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>Processar e enviar seu pedido ao estabelecimento via WhatsApp.</li>
                            <li>Facilitar futuros pedidos com preenchimento automático de dados.</li>
                            <li>Manter o funcionamento técnico do cardápio (identificação da loja, sessão).</li>
                        </ul>
                        <p className="mt-3">
                            Não vendemos, alugamos ou compartilhamos seus dados pessoais com terceiros para fins comerciais.
                            Os dados do pedido são compartilhados exclusivamente com o estabelecimento ao qual o pedido foi enviado.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-gray-900 mb-3">5. Base legal (LGPD)</h2>
                        <p>
                            O tratamento dos seus dados é baseado nas seguintes hipóteses previstas na Lei n.º 13.709/2018 (LGPD):
                        </p>
                        <ul className="list-disc pl-6 mt-2 space-y-1">
                            <li><strong>Execução de contrato</strong> (art. 7º, V) — dados de nome, telefone e endereço são necessários para processar seu pedido.</li>
                            <li><strong>Legítimo interesse</strong> (art. 7º, IX) — armazenamento local do carrinho e dados de preenchimento automático para melhorar sua experiência.</li>
                            <li><strong>Consentimento</strong> (art. 7º, I) — ao aceitar os cookies pelo banner exibido no site.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-gray-900 mb-3">6. Seus direitos como titular</h2>
                        <p>Nos termos da LGPD, você tem direito a:</p>
                        <ul className="list-disc pl-6 mt-2 space-y-1">
                            <li>Confirmar se tratamos seus dados.</li>
                            <li>Acessar os dados que temos sobre você.</li>
                            <li>Corrigir dados incompletos, inexatos ou desatualizados.</li>
                            <li>Solicitar a exclusão dos seus dados.</li>
                            <li>Revogar o consentimento a qualquer momento.</li>
                            <li>Portabilidade dos dados a outro fornecedor.</li>
                        </ul>
                        <p className="mt-3">
                            Você pode excluir os dados salvos localmente a qualquer momento limpando os dados do
                            site no seu navegador (<strong>Configurações → Privacidade → Limpar dados de navegação</strong>).
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-gray-900 mb-3">7. Retenção dos dados</h2>
                        <p>
                            Os dados do pedido são mantidos pelo estabelecimento pelo tempo necessário para fins
                            comerciais e fiscais, de acordo com a legislação vigente.
                            Os dados salvos no seu dispositivo (localStorage/cookies) permanecem até que você os exclua
                            manualmente ou limpe os dados do navegador.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-gray-900 mb-3">8. Segurança</h2>
                        <p>
                            Adotamos medidas técnicas para proteger seus dados, incluindo comunicação criptografada (HTTPS),
                            autenticação segura via Supabase e isolamento de dados por loja (Row Level Security).
                            Nenhum sistema é 100% seguro, mas nos comprometemos a adotar boas práticas de segurança da informação.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-gray-900 mb-3">9. Contato e encarregado (DPO)</h2>
                        <p>
                            Para exercer seus direitos ou esclarecer dúvidas sobre privacidade, entre em contato:
                        </p>
                        <ul className="list-none mt-2 space-y-1">
                            <li><strong>Plataforma:</strong> RMenu</li>
                            <li><strong>E-mail:</strong> <a href="mailto:richardgms001@gmail.com" className="text-primary underline hover:no-underline">richardgms001@gmail.com</a></li>
                            <li><strong>Site:</strong> <a href="https://rmenu.com.br" className="text-primary underline hover:no-underline">rmenu.com.br</a></li>
                        </ul>
                        <p className="mt-3">
                            Para reclamações relacionadas ao estabelecimento específico onde você fez o pedido,
                            entre em contato diretamente com ele.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-gray-900 mb-3">10. Alterações nesta política</h2>
                        <p>
                            Podemos atualizar esta política periodicamente. A data da última atualização está sempre
                            indicada no topo desta página. Recomendamos revisá-la ocasionalmente.
                        </p>
                    </section>
                </div>

                <div className="mt-12 pt-8 border-t text-center">
                    <Link href="/" className="text-primary text-sm hover:underline">
                        ← Voltar ao início
                    </Link>
                </div>
            </main>

            <footer className="bg-gray-900 text-gray-400 py-8 mt-12">
                <div className="container mx-auto px-4 text-center text-sm">
                    <p>&copy; {new Date().getFullYear()} RMenu. Todos os direitos reservados.</p>
                </div>
            </footer>
        </div>
    )
}
