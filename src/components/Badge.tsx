const TONES: Record<string, string> = {
  good: 'bg-olive/15 text-olive', bad: 'bg-red-50 text-red-800', warn: 'bg-gold/20 text-[#7a6330]', neutral: 'bg-cream text-forest',
}
export default function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'good' | 'bad' | 'warn' | 'neutral' }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[tone]}`}>{children}</span>
}
export const invoiceTone = (s: string) => (s === 'pago' ? 'good' : s === 'vencido' ? 'bad' : s === 'parcialmente_pago' ? 'warn' : s === 'cancelado' ? 'neutral' : 'neutral') as 'good' | 'bad' | 'warn' | 'neutral'
