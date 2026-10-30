import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Shirt, Package, Plus, Search, Edit2, Trash2, CheckCircle2,
  AlertCircle, Download, Tag, BookOpen, Layers, Check, X, Sparkles, Filter
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatBRL } from '@/lib/format'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/Toast'
import { PageHeader, ErrorBox } from '@/components/ui'
import { Loading } from '@/components/ProtectedRoute'
import ConfirmDialog from '@/components/ConfirmDialog'
import { exportCSV } from '@/lib/csv'
import type { SchoolItem } from '@/lib/types'

const INITIAL_ITEMS: SchoolItem[] = [
  {
    id: 'fard-1',
    type: 'fardamento',
    name: 'Camisa Polo Manga Curta (Uniforme Diário)',
    category: 'Diário',
    stage_id: null,
    size: 'Tam 2, 4, 6, 8, 10, 12, P, M',
    unit_price: 65.0,
    cost_price: 32.0,
    stock_quantity: 48,
    min_stock: 10,
    school_year_id: null,
    description: 'Polo em piquet verde floresta com gola em ribana e brasão Little Garden bordado no peito.',
    is_active: true,
  },
  {
    id: 'fard-2',
    type: 'fardamento',
    name: 'Bermuda Helanca com Elástico',
    category: 'Diário',
    stage_id: null,
    size: 'Tam 2, 4, 6, 8, 10, 12',
    unit_price: 55.0,
    cost_price: 26.0,
    stock_quantity: 35,
    min_stock: 10,
    school_year_id: null,
    description: 'Bermuda confortável com bolsos e cordão ajustável na cintura.',
    is_active: true,
  },
  {
    id: 'fard-3',
    type: 'fardamento',
    name: 'Saia-Short Feminina Helanca',
    category: 'Diário',
    stage_id: null,
    size: 'Tam 2, 4, 6, 8, 10',
    unit_price: 58.0,
    cost_price: 28.0,
    stock_quantity: 22,
    min_stock: 8,
    school_year_id: null,
    description: 'Saia com short embutido para maior liberdade de movimento das alunas.',
    is_active: true,
  },
  {
    id: 'fard-4',
    type: 'fardamento',
    name: 'Casaco Moletom com Zíper e Capuz',
    category: 'Inverno',
    stage_id: null,
    size: 'Tam 2, 4, 6, 8, 10, 12, P',
    unit_price: 110.0,
    cost_price: 55.0,
    stock_quantity: 18,
    min_stock: 5,
    school_year_id: null,
    description: 'Moletom flanelado verde musgo com forro macio e estampa bordada.',
    is_active: true,
  },
  {
    id: 'fard-5',
    type: 'fardamento',
    name: 'Camisa Regata de Algodão (Ed. Física)',
    category: 'Educação Física',
    stage_id: null,
    size: 'Tam 2, 4, 6, 8, 10, 12',
    unit_price: 45.0,
    cost_price: 20.0,
    stock_quantity: 40,
    min_stock: 10,
    school_year_id: null,
    description: '100% algodão penteado, fresca e ideal para atividades esportivas e recreação.',
    is_active: true,
  },
  {
    id: 'mat-1',
    type: 'material',
    name: 'Kit de Material Pedagógico Coletivo — Infantil I e II',
    category: 'Kit Pedagógico',
    stage_id: null,
    size: 'Kit Anual',
    unit_price: 420.0,
    cost_price: 290.0,
    stock_quantity: 30,
    min_stock: 5,
    school_year_id: null,
    description: 'Massas de modelar atóxicas, tintas guache, colas líquidas e bastão, papéis coloridos diversos, giz de cera jumbo, pincéis e materiais para projetos de psicomotricidade.',
    is_active: true,
  },
  {
    id: 'mat-2',
    type: 'material',
    name: 'Kit de Material Pedagógico Coletivo — Infantil III e IV',
    category: 'Kit Pedagógico',
    stage_id: null,
    size: 'Kit Anual',
    unit_price: 460.0,
    cost_price: 310.0,
    stock_quantity: 25,
    min_stock: 5,
    school_year_id: null,
    description: 'Tesouras pedagógicas sem ponta, estojos de canetas hidrográficas, pasta catálogo plástica, jogos de encaixe e blocos lógicos, blocos de desenho A3 e A4.',
    is_active: true,
  },
  {
    id: 'mat-3',
    type: 'material',
    name: 'Kit Didático e Cadernos — Ensino Fundamental I',
    category: 'Livros e Cadernos',
    stage_id: null,
    size: 'Kit Anual',
    unit_price: 550.0,
    cost_price: 390.0,
    stock_quantity: 20,
    min_stock: 5,
    school_year_id: null,
    description: 'Cadernos brochura pautados personalizados, agenda escolar 2027, régua, lápis grafite, borracha, canetas, pasta fichário e kit de arte avançado.',
    is_active: true,
  },
  {
    id: 'mat-4',
    type: 'material',
    name: 'Taxa Anual de Materiais de Higiene e Primeiros Socorros',
    category: 'Taxa Anual',
    stage_id: null,
    size: 'Por Aluno',
    unit_price: 180.0,
    cost_price: 110.0,
    stock_quantity: 100,
    min_stock: 10,
    school_year_id: null,
    description: 'Lenços umedecidos, álcool 70%, sabonetes líquidos infantis, curativos e itens de higiene coletiva para berçário e maternal.',
    is_active: true,
  },
]

const LOCAL_STORAGE_KEY = 'lg_school_items_store'

export default function SchoolItemsPage() {
  const toast = useToast()
  const { hasRole } = useAuth()
  const canManage = hasRole('direcao', 'secretaria')
  const [tab, setTab] = useState<'fardamento' | 'material'>('fardamento')
  const [items, setItems] = useState<SchoolItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [modalItem, setModalItem] = useState<SchoolItem | null | 'new'>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<SchoolItem | null>(null)
  const [busy, setBusy] = useState(false)
  const [usingDb, setUsingDb] = useState(false)

  // Carregar itens do Supabase com fallback local
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('school_items').select('*').order('name')
      if (error) {
        // Se a tabela ainda não foi criada no Supabase pelo SQL Editor, usa local store
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY)
        if (saved) {
          setItems(JSON.parse(saved))
        } else {
          setItems(INITIAL_ITEMS)
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_ITEMS))
        }
        setUsingDb(false)
      } else if (data && data.length > 0) {
        setItems(data as SchoolItem[])
        setUsingDb(true)
      } else {
        // Banco vazio: tenta semear os itens iniciais
        setItems(INITIAL_ITEMS)
        setUsingDb(true)
        void supabase.from('school_items').insert(INITIAL_ITEMS)
      }
    } catch {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY)
      setItems(saved ? JSON.parse(saved) : INITIAL_ITEMS)
      setUsingDb(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Salvar item (criar ou editar)
  async function handleSaveItem(item: Partial<SchoolItem>) {
    setBusy(true)
    try {
      if (item.id && item.id !== 'new') {
        // Edição
        if (usingDb) {
          await supabase.from('school_items').update(item).eq('id', item.id)
        }
        const updated = items.map((i) => (i.id === item.id ? ({ ...i, ...item } as SchoolItem) : i))
        setItems(updated)
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
        toast.success('Item atualizado com sucesso!')
      } else {
        // Criação
        const newItem: SchoolItem = {
          id: 'item_' + Date.now(),
          type: tab,
          name: item.name || '',
          category: item.category || 'Geral',
          stage_id: item.stage_id || null,
          size: item.size || '',
          unit_price: Number(item.unit_price) || 0,
          cost_price: Number(item.cost_price) || 0,
          stock_quantity: Number(item.stock_quantity) || 0,
          min_stock: Number(item.min_stock) || 0,
          description: item.description || '',
          is_active: item.is_active ?? true,
          created_at: new Date().toISOString(),
        }

        if (usingDb) {
          const { data } = await supabase.from('school_items').insert(newItem).select().single()
          if (data) newItem.id = data.id
        }

        const updated = [newItem, ...items]
        setItems(updated)
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
        toast.success(`${tab === 'fardamento' ? 'Fardamento' : 'Material'} cadastrado com sucesso!`)
      }
      setModalItem(null)
    } catch (err: any) {
      toast.error('Erro ao salvar item: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  // Excluir item
  async function handleDelete() {
    if (!deleteConfirm) return
    setBusy(true)
    try {
      if (usingDb) {
        await supabase.from('school_items').delete().eq('id', deleteConfirm.id)
      }
      const updated = items.filter((i) => i.id !== deleteConfirm.id)
      setItems(updated)
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
      toast.success('Item removido.')
      setDeleteConfirm(null)
    } catch (err: any) {
      toast.error('Erro ao excluir: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  // Alternar ativo/inativo
  async function toggleActive(item: SchoolItem) {
    const next = !item.is_active
    try {
      if (usingDb) {
        await supabase.from('school_items').update({ is_active: next }).eq('id', item.id)
      }
      const updated = items.map((i) => (i.id === item.id ? { ...i, is_active: next } : i))
      setItems(updated)
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
      toast.success(next ? 'Item ativado.' : 'Item desativado.')
    } catch (err: any) {
      toast.error('Erro ao alterar status: ' + err.message)
    }
  }

  // Categorias disponíveis
  const categories = useMemo(() => {
    const list = items.filter((i) => i.type === tab).map((i) => i.category).filter(Boolean)
    return Array.from(new Set(list))
  }, [items, tab])

  // Itens filtrados
  const filteredItems = useMemo(() => {
    return items.filter((i) => {
      if (i.type !== tab) return false
      const term = search.toLowerCase()
      const matchesSearch =
        !term ||
        i.name.toLowerCase().includes(term) ||
        (i.description || '').toLowerCase().includes(term) ||
        (i.category || '').toLowerCase().includes(term)
      const matchesCat = categoryFilter === 'all' || i.category === categoryFilter
      return matchesSearch && matchesCat
    })
  }, [items, tab, search, categoryFilter])

  // Métricas
  const stats = useMemo(() => {
    const uniforms = items.filter((i) => i.type === 'fardamento')
    const materials = items.filter((i) => i.type === 'material')
    const totalUniformStock = uniforms.reduce((acc, i) => acc + (i.stock_quantity || 0), 0)
    const avgMaterialPrice =
      materials.length > 0
        ? materials.reduce((acc, i) => acc + i.unit_price, 0) / materials.length
        : 0
    return {
      uniformCount: uniforms.length,
      materialCount: materials.length,
      totalUniformStock,
      avgMaterialPrice,
    }
  }, [items])

  // Exportar Tabela de Preços em CSV
  function handleExportPrices() {
    exportCSV(
      `tabela-precos-${tab}s-2027`,
      [
        { key: 'nome', label: 'Item' },
        { key: 'categoria', label: 'Categoria' },
        { key: 'tamanho', label: 'Tamanho / Modelo' },
        { key: 'preco', label: 'Valor de Venda (R$)' },
        { key: 'estoque', label: 'Estoque' },
        { key: 'status', label: 'Status' },
        { key: 'descricao', label: 'Descrição' },
      ],
      filteredItems.map((i) => ({
        nome: i.name,
        categoria: i.category || 'Geral',
        tamanho: i.size || 'Único',
        preco: formatBRL(i.unit_price),
        estoque: i.stock_quantity ?? 0,
        status: i.is_active ? 'Ativo' : 'Inativo',
        descricao: i.description || '',
      }))
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fardamentos e Materiais Escolares"
        subtitle="Cadastro de uniformes, precificação, controle de estoque e kits didáticos de materiais."
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-secondary flex items-center gap-2" onClick={handleExportPrices}>
              <Download className="h-4 w-4" /> Exportar Preços CSV
            </button>
            {canManage && (
              <button
                className="btn-primary flex items-center gap-2"
                onClick={() => setModalItem('new')}
              >
                <Plus className="h-4 w-4" />
                {tab === 'fardamento' ? 'Cadastrar Fardamento' : 'Cadastrar Material/Kit'}
              </button>
            )}
          </div>
        }
      />

      {/* KPIs da página */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card p-4 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-forest/10 text-forest">
            <Shirt className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted">Peças de Fardamento</p>
            <p className="text-2xl font-bold text-forest">{stats.uniformCount}</p>
            <p className="text-[11px] text-muted">{stats.totalUniformStock} peças em estoque</p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-olive/15 text-olive">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted">Kits de Materiais</p>
            <p className="text-2xl font-bold text-olive">{stats.materialCount}</p>
            <p className="text-[11px] text-muted">Configurados por etapa</p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
            <Tag className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted">Valor Médio dos Kits</p>
            <p className="text-2xl font-bold text-amber-800">{formatBRL(stats.avgMaterialPrice)}</p>
            <p className="text-[11px] text-muted">Preço médio por etapa</p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/20 text-forest">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted">Ano Letivo de Vigência</p>
            <p className="text-2xl font-bold text-forest">2027</p>
            <p className="text-[11px] text-muted">Tabela atualizada para rematrícula</p>
          </div>
        </div>
      </div>

      {/* Navegação entre Abas */}
      <div className="flex border-b border-nude">
        <button
          type="button"
          onClick={() => {
            setTab('fardamento')
            setCategoryFilter('all')
          }}
          className={`flex items-center gap-2 px-6 py-3 font-semibold text-sm border-b-2 transition-colors ${
            tab === 'fardamento'
              ? 'border-forest text-forest bg-white/50'
              : 'border-transparent text-muted hover:text-forest'
          }`}
        >
          <Shirt className="h-4 w-4" />
          Fardamentos Escolares ({items.filter((i) => i.type === 'fardamento').length})
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('material')
            setCategoryFilter('all')
          }}
          className={`flex items-center gap-2 px-6 py-3 font-semibold text-sm border-b-2 transition-colors ${
            tab === 'material'
              ? 'border-forest text-forest bg-white/50'
              : 'border-transparent text-muted hover:text-forest'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          Materiais e Taxas Pedagógicas ({items.filter((i) => i.type === 'material').length})
        </button>
      </div>

      {/* Filtros e Busca */}
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            className="input w-full pl-10"
            placeholder={`Buscar em ${tab === 'fardamento' ? 'fardamentos' : 'materiais'}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            className="input text-xs py-2 px-3 w-auto"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">Todas as categorias</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grade de Itens */}
      {loading ? (
        <Loading label="Carregando tabela de preços e estoque..." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item) => {
            const isLowStock =
              item.stock_quantity !== undefined &&
              item.min_stock !== undefined &&
              item.stock_quantity <= item.min_stock

            return (
              <div
                key={item.id}
                className="card flex flex-col justify-between p-5 hover:shadow-md transition-shadow relative overflow-hidden"
              >
                {!item.is_active && (
                  <div className="absolute top-2 right-2 rounded-full bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5">
                    Inativo
                  </div>
                )}

                <div>
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                        item.type === 'fardamento'
                          ? 'bg-forest/10 text-forest'
                          : 'bg-olive/15 text-olive'
                      }`}
                    >
                      {item.type === 'fardamento' ? (
                        <Shirt className="h-5 w-5" />
                      ) : (
                        <Package className="h-5 w-5" />
                      )}
                    </div>
                    <div className="pr-8">
                      <span className="text-[11px] font-semibold text-olive uppercase tracking-wider">
                        {item.category || 'Geral'}
                      </span>
                      <h3 className="font-bold text-forest text-base leading-snug">{item.name}</h3>
                    </div>
                  </div>

                  {item.description && (
                    <p className="mt-2 text-xs text-muted line-clamp-3">{item.description}</p>
                  )}

                  <div className="mt-4 pt-3 border-t border-nude/60 space-y-2 text-xs">
                    {item.size && (
                      <div className="flex items-center justify-between text-muted">
                        <span>Tamanhos / Modelo:</span>
                        <span className="font-semibold text-forest">{item.size}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-muted">
                      <span>Estoque disponível:</span>
                      <span
                        className={`font-semibold ${
                          isLowStock ? 'text-red-700 font-bold' : 'text-forest'
                        }`}
                      >
                        {item.stock_quantity} un {isLowStock && '(Estoque Baixo)'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-nude flex items-end justify-between">
                  <div>
                    <span className="text-[11px] font-semibold text-muted block">VALOR DE VENDA</span>
                    <span className="text-2xl font-black text-forest">
                      {formatBRL(item.unit_price)}
                    </span>
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleActive(item)}
                        title={item.is_active ? 'Desativar item' : 'Ativar item'}
                        className={`p-1.5 rounded-lg border transition-colors ${
                          item.is_active
                            ? 'text-olive border-olive/30 hover:bg-olive/10'
                            : 'text-muted border-nude hover:bg-cream'
                        }`}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalItem(item)}
                        title="Editar valor e detalhes"
                        className="p-1.5 rounded-lg border border-nude text-forest hover:bg-cream transition-colors"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(item)}
                        title="Excluir item"
                        className="p-1.5 rounded-lg border border-nude text-red-700 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {filteredItems.length === 0 && (
            <div className="col-span-full card p-8 text-center text-muted">
              Nenhum {tab === 'fardamento' ? 'fardamento' : 'material'} encontrado com os filtros atuais.
            </div>
          )}
        </div>
      )}

      {/* Modal de Criação / Edição de Item */}
      {modalItem && (
        <ItemModal
          type={tab}
          item={modalItem === 'new' ? null : modalItem}
          busy={busy}
          onClose={() => setModalItem(null)}
          onSave={handleSaveItem}
        />
      )}

      {/* Diálogo de Exclusão */}
      <ConfirmDialog
        open={!!deleteConfirm}
        busy={busy}
        danger
        title="Excluir item do catálogo?"
        confirmLabel="Sim, excluir"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteConfirm(null)}
      >
        <p className="text-sm">
          Deseja realmente remover <strong>{deleteConfirm?.name}</strong> do catálogo escolar?
        </p>
      </ConfirmDialog>
    </div>
  )
}

function ItemModal({
  type,
  item,
  busy,
  onClose,
  onSave,
}: {
  type: 'fardamento' | 'material'
  item: SchoolItem | null
  busy: boolean
  onClose: () => void
  onSave: (val: Partial<SchoolItem>) => void
}) {
  const [name, setName] = useState(item?.name || '')
  const [category, setCategory] = useState(
    item?.category || (type === 'fardamento' ? 'Diário' : 'Kit Pedagógico')
  )
  const [size, setSize] = useState(
    item?.size || (type === 'fardamento' ? 'Tam 2 a 12' : 'Kit Anual')
  )
  const [unitPrice, setUnitPrice] = useState(item ? String(item.unit_price) : '')
  const [costPrice, setCostPrice] = useState(item?.cost_price ? String(item.cost_price) : '')
  const [stockQuantity, setStockQuantity] = useState(
    item ? String(item.stock_quantity) : '20'
  )
  const [minStock, setMinStock] = useState(item?.min_stock ? String(item.min_stock) : '5')
  const [description, setDescription] = useState(item?.description || '')
  const [isActive, setIsActive] = useState(item?.is_active ?? true)
  const [error, setError] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) return setError('Informe o nome do item.')
    const priceNum = parseFloat(unitPrice.replace(',', '.'))
    if (isNaN(priceNum) || priceNum < 0) return setError('Informe um valor de venda válido.')

    onSave({
      id: item?.id,
      type,
      name: name.trim(),
      category: category.trim(),
      size: size.trim(),
      unit_price: priceNum,
      cost_price: parseFloat(costPrice.replace(',', '.')) || 0,
      stock_quantity: parseInt(stockQuantity, 10) || 0,
      min_stock: parseInt(minStock, 10) || 0,
      description: description.trim(),
      is_active: isActive,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="card w-full max-w-lg p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-nude pb-3">
          <h2 className="text-lg font-bold text-forest">
            {item ? 'Editar Item' : type === 'fardamento' ? 'Novo Fardamento' : 'Novo Material / Kit'}
          </h2>
          <button type="button" className="text-muted hover:text-forest" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="label">Nome da peça ou kit *</label>
            <input
              className="input"
              placeholder={
                type === 'fardamento'
                  ? 'Ex: Camisa Polo Manga Curta Bordada'
                  : 'Ex: Kit de Material Didático Coletivo — Infantil III'
              }
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Categoria</label>
              <input
                className="input"
                placeholder={type === 'fardamento' ? 'Diário, Ed. Física, Inverno...' : 'Kit, Taxa, Livro...'}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            <div>
              <label className="label">{type === 'fardamento' ? 'Tamanhos' : 'Vigência / Modelo'}</label>
              <input
                className="input"
                placeholder={type === 'fardamento' ? 'Ex: 2, 4, 6, 8, 10, P, M' : 'Ex: Kit Anual 2027'}
                value={size}
                onChange={(e) => setSize(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Valor de Venda (R$) *</label>
              <input
                className="input font-semibold text-forest text-base"
                placeholder="0,00"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Custo Unitário (R$, opcional)</label>
              <input
                className="input"
                placeholder="0,00"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Estoque Atual</label>
              <input
                type="number"
                className="input"
                value={stockQuantity}
                onChange={(e) => setStockQuantity(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Estoque Mínimo (Alerta)</label>
              <input
                type="number"
                className="input"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label">Descrição detalhada / Itens inclusos</label>
            <textarea
              className="input min-h-[90px]"
              rows={3}
              placeholder="Descreva as especificações do tecido ou a lista de materiais inclusos no kit..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="rounded-xl bg-cream/70 p-3 border border-nude">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-forest">
              <input
                type="checkbox"
                className="rounded border-nude text-olive focus:ring-olive"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span>Disponível no catálogo ativo para os pais e secretaria</span>
            </label>
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-nude">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Salvando...' : 'Salvar no Catálogo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
