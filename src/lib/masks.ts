// Máscaras reutilizáveis nos formulários dos próximos módulos.
const digits = (v: string) => v.replace(/\D/g, '')

export const maskCPF = (v: string) =>
  digits(v).slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')

export const maskCNPJ = (v: string) =>
  digits(v).slice(0, 14).replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2')

export const maskPhone = (v: string) => {
  const d = digits(v).slice(0, 11)
  return d.length > 10
    ? d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3')
    : d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '')
}
export const maskCEP = (v: string) => digits(v).slice(0, 8).replace(/(\d{5})(\d{1,3})$/, '$1-$2')

/** Digitação de moeda: '12345' -> 'R$ 123,45'. Use parseCurrency para obter o número. */
export const maskCurrency = (v: string) => {
  const n = Number(digits(v)) / 100
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
export const parseCurrency = (v: string) => Number(digits(v)) / 100

export function isValidCPF(cpf: string): boolean {
  const d = digits(cpf)
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
  const calc = (len: number) => {
    let s = 0
    for (let i = 0; i < len; i++) s += Number(d[i]) * (len + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10])
}
