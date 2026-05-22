import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { adminApi } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import type { Category, MenuConfig, MenuCourseTag, ModifierGroup, ModifierOption, ProductType } from '../../types';

interface ModifierOptionForm {
  id?: number;
  name: string;
  priceDelta: number;
  sortOrder: number;
  isActive: boolean;
}

interface ModifierGroupForm {
  id?: number;
  name: string;
  minSelections: number;
  maxSelections: number;
  sortOrder: number;
  isActive: boolean;
  options: ModifierOptionForm[];
}

interface CatForm {
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
  modifierGroups: ModifierGroupForm[];
}

interface ProdForm {
  name: string;
  description: string;
  price: number;
  vatRate: number;
  categoryId: number;
  productType: ProductType;
  menuCourseTags: MenuCourseTag[];
  menuConfig: MenuConfig | null;
  sortOrder: number;
}

type AdminCategory = Category & { _count?: { products: number } };
type AdminProduct = ProdForm & { id: number; isAvailable: boolean; category: { name: string } };

const DEFAULT_GROUP: ModifierGroupForm = {
  name: '',
  minSelections: 1,
  maxSelections: 1,
  sortOrder: 0,
  isActive: true,
  options: [],
};

const DEFAULT_OPTION: ModifierOptionForm = {
  name: '',
  priceDelta: 0,
  sortOrder: 0,
  isActive: true,
};

const DEFAULT_CAT: CatForm = {
  name: '',
  color: '#9A6B3F',
  icon: '',
  sortOrder: 0,
  modifierGroups: [],
};

const DEFAULT_PROD: ProdForm = {
  name: '',
  description: '',
  price: 0,
  vatRate: 10,
  categoryId: 0,
  productType: 'NORMAL',
  menuCourseTags: [],
  menuConfig: null,
  sortOrder: 0,
};

const MENU_TAG_OPTIONS: Array<{ value: MenuCourseTag; label: string }> = [
  { value: 'FIRST', label: 'Primero' },
  { value: 'SECOND', label: 'Segundo' },
  { value: 'DESSERT', label: 'Postre' },
  { value: 'COFFEE', label: 'Café' },
];

function mapGroups(groups?: ModifierGroup[]): ModifierGroupForm[] {
  return (groups ?? []).map((group) => ({
    id: group.id,
    name: group.name,
    minSelections: group.minSelections,
    maxSelections: group.maxSelections,
    sortOrder: group.sortOrder,
    isActive: group.isActive,
    options: group.options.map((option: ModifierOption) => ({
      id: option.id,
      name: option.name,
      priceDelta: Number(option.priceDelta),
      sortOrder: option.sortOrder,
      isActive: option.isActive,
    })),
  }));
}

function normalizeProduct(product: AdminProduct): AdminProduct {
  return {
    ...product,
    description: product.description ?? '',
    productType: product.productType ?? 'NORMAL',
    menuCourseTags: product.menuCourseTags ?? [],
    menuConfig: product.productType === 'MENU'
      ? product.menuConfig ?? { includeFirst: true, includeSecond: true, finalMode: 'DESSERT_ONLY' }
      : null,
  };
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const apiMessage = error.response?.data?.message;
    const details = error.response?.data?.details;

    if (details && typeof details === 'object') {
      const firstDetail = Object.values(details as Record<string, unknown>).flat().find(Boolean);
      if (typeof firstDetail === 'string') return firstDetail;
    }

    if (typeof apiMessage === 'string' && apiMessage.trim()) return apiMessage;
  }

  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function ProductsAdminPage() {
  const { currentVenueId } = useAppStore();
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
  const [catForm, setCatForm] = useState<CatForm>(DEFAULT_CAT);
  const [prodForm, setProdForm] = useState<ProdForm>(DEFAULT_PROD);
  const [editingCat, setEditingCat] = useState<number | null>(null);
  const [editingProd, setEditingProd] = useState<number | null>(null);
  const [showCatModal, setShowCatModal] = useState(false);
  const [showProdModal, setShowProdModal] = useState(false);

  const load = async () => {
    if (!currentVenueId) return;
    const [cats, prods] = await Promise.all([
      adminApi.getCategories(currentVenueId),
      adminApi.getProducts(currentVenueId),
    ]);
    setCategories(cats);
    setProducts(prods.map(normalizeProduct));
  };

  useEffect(() => {
    load();
  }, [currentVenueId]);

  const saveCategory = async () => {
    if (!currentVenueId) return;
    try {
      const payload = {
        ...catForm,
        icon: catForm.icon || null,
      };

      if (editingCat) await adminApi.updateCategory(editingCat, payload);
      else await adminApi.createCategory(currentVenueId, payload);

      toast.success('Categoría guardada');
      setShowCatModal(false);
      setEditingCat(null);
      setCatForm(DEFAULT_CAT);
      load();
    } catch {
      toast.error('Error guardando categoría');
    }
  };

  const saveProduct = async () => {
    if (!currentVenueId) return;
    try {
      const payload = {
        name: prodForm.name,
        description: prodForm.description,
        price: prodForm.price,
        vatRate: prodForm.vatRate,
        categoryId: prodForm.categoryId,
        productType: prodForm.productType,
        menuCourseTags: prodForm.productType === 'NORMAL' ? prodForm.menuCourseTags : [],
        menuConfig: prodForm.productType === 'MENU' ? prodForm.menuConfig : null,
        sortOrder: prodForm.sortOrder,
      };

      if (editingProd) await adminApi.updateProduct(editingProd, payload);
      else await adminApi.createProduct(currentVenueId, payload);
      toast.success('Producto guardado');
      setShowProdModal(false);
      setEditingProd(null);
      setProdForm({ ...DEFAULT_PROD, categoryId: selectedCatId ?? 0 });
      load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Error guardando producto'));
    }
  };

  const deleteProduct = async (id: number) => {
    if (!confirm('¿Desactivar este producto?')) return;
    try {
      await adminApi.deleteProduct(id);
      toast.success('Producto desactivado');
      load();
    } catch {
      toast.error('Error al desactivar el producto');
    }
  };

  const toggleProductAvailability = async (product: AdminProduct) => {
    try {
      await adminApi.updateProduct(product.id, { isAvailable: !product.isAvailable });
      setProducts((current) => current.map((entry) => (
        entry.id === product.id ? { ...entry, isAvailable: !product.isAvailable } : entry
      )));
      toast.success(!product.isAvailable ? 'Artículo activado' : 'Artículo marcado como agotado');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Error actualizando disponibilidad'));
    }
  };

  const filteredProducts = selectedCatId ? products.filter((product) => product.categoryId === selectedCatId) : products;

  const openNewCategoryModal = () => {
    setCatForm(DEFAULT_CAT);
    setEditingCat(null);
    setShowCatModal(true);
  };

  const openEditCategoryModal = (category: AdminCategory) => {
    setCatForm({
      name: category.name,
      color: category.color ?? '#9A6B3F',
      icon: category.icon ?? '',
      sortOrder: category.sortOrder,
      modifierGroups: mapGroups(category.modifierGroups),
    });
    setEditingCat(category.id);
    setShowCatModal(true);
  };

  const addModifierGroup = () => {
    setCatForm((current) => ({
      ...current,
      modifierGroups: [
        ...current.modifierGroups,
        { ...DEFAULT_GROUP, sortOrder: current.modifierGroups.length },
      ],
    }));
  };

  const updateModifierGroup = (groupIndex: number, patch: Partial<ModifierGroupForm>) => {
    setCatForm((current) => ({
      ...current,
      modifierGroups: current.modifierGroups.map((group, index) => (
        index === groupIndex ? { ...group, ...patch } : group
      )),
    }));
  };

  const removeModifierGroup = (groupIndex: number) => {
    setCatForm((current) => ({
      ...current,
      modifierGroups: current.modifierGroups.filter((_, index) => index !== groupIndex),
    }));
  };

  const addModifierOption = (groupIndex: number) => {
    setCatForm((current) => ({
      ...current,
      modifierGroups: current.modifierGroups.map((group, index) => (
        index === groupIndex
          ? {
              ...group,
              options: [
                ...group.options,
                { ...DEFAULT_OPTION, sortOrder: group.options.length },
              ],
            }
          : group
      )),
    }));
  };

  const updateModifierOption = (groupIndex: number, optionIndex: number, patch: Partial<ModifierOptionForm>) => {
    setCatForm((current) => ({
      ...current,
      modifierGroups: current.modifierGroups.map((group, index) => (
        index === groupIndex
          ? {
              ...group,
              options: group.options.map((option, innerIndex) => (
                innerIndex === optionIndex ? { ...option, ...patch } : option
              )),
            }
          : group
      )),
    }));
  };

  const removeModifierOption = (groupIndex: number, optionIndex: number) => {
    setCatForm((current) => ({
      ...current,
      modifierGroups: current.modifierGroups.map((group, index) => (
        index === groupIndex
          ? { ...group, options: group.options.filter((_, innerIndex) => innerIndex !== optionIndex) }
          : group
      )),
    }));
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Catálogo</h1>
          <p className="admin-page-subtitle">Categorías, productos y subfamilias operativas de la sede</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button id="btn-new-category" className="btn btn-secondary" onClick={openNewCategoryModal}>
            Nueva categoría
          </button>
          <button
            id="btn-new-product"
            className="btn btn-primary"
            onClick={() => {
              setProdForm({ ...DEFAULT_PROD, categoryId: selectedCatId ?? 0 });
              setEditingProd(null);
              setShowProdModal(true);
            }}
          >
            Nuevo producto
          </button>
        </div>
      </div>

      <div className="admin-products-layout">
        <div className="admin-products-cats">
          <button
            className={`admin-cat-btn ${selectedCatId === null ? 'active' : ''}`}
            onClick={() => setSelectedCatId(null)}
          >
            <span>Todos</span>
            <span className="admin-cat-count">{products.length}</span>
          </button>
          {categories.map((category) => (
            <div key={category.id} className="admin-cat-row">
              <button
                className={`admin-cat-btn ${selectedCatId === category.id ? 'active' : ''}`}
                onClick={() => setSelectedCatId(category.id)}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: category.color ?? '#9A6B3F', flexShrink: 0 }} />
                  {category.name}
                </span>
                <span className="admin-cat-count">{category._count?.products ?? 0}</span>
              </button>
              <button className="admin-cat-edit" onClick={() => openEditCategoryModal(category)}>
                Editar
              </button>
            </div>
          ))}
        </div>

        <div className="admin-section" style={{ flex: 1 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Categoría</th>
                <th>Precio</th>
                <th>IVA</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                    Sin productos. Crea el primero.
                  </td>
                </tr>
              )}
              {filteredProducts.map((product) => (
                <tr key={product.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{product.name}</div>
                    {product.description && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        {product.description.substring(0, 50)}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className="admin-badge admin-badge--info">{product.category.name}</span>
                  </td>
                  <td style={{ fontWeight: 700, color: 'var(--color-accent)' }}>{Number(product.price).toFixed(2)} €</td>
                  <td>{Number(product.vatRate)}%</td>
                  <td>
                    <div className="toggle-group" style={{ minWidth: 180 }}>
                      <span className={`admin-badge ${product.isAvailable ? 'admin-badge--success' : 'admin-badge--muted'}`}>
                        {product.isAvailable ? 'Disponible' : 'Agotado'}
                      </span>
                      <label className="toggle-switch" aria-label={`Cambiar disponibilidad de ${product.name}`}>
                        <input
                          type="checkbox"
                          checked={product.isAvailable}
                          onChange={() => toggleProductAvailability(product)}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                        onClick={() => {
                          setProdForm({
                            name: product.name,
                            description: product.description,
                            price: Number(product.price),
                            vatRate: Number(product.vatRate),
                            categoryId: product.categoryId,
                            productType: product.productType,
                            menuCourseTags: product.menuCourseTags ?? [],
                            menuConfig: product.menuConfig ?? null,
                            sortOrder: product.sortOrder,
                          });
                          setEditingProd(product.id);
                          setShowProdModal(true);
                        }}
                      >
                        Editar
                      </button>
                      <button
                        className="btn btn-danger"
                        style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                        onClick={() => deleteProduct(product.id)}
                      >
                        Ocultar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCatModal && (
        <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && setShowCatModal(false)}>
          <div className="modal" style={{ maxWidth: 860 }}>
            <h3 className="modal__title">{editingCat ? 'Editar categoría' : 'Nueva categoría'}</h3>
            <div className="form-group">
              <label className="form-label">Nombre</label>
              <input
                className="form-input"
                value={catForm.name}
                onChange={(event) => setCatForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Ej: Tostadas"
              />
            </div>
            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Color</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={catForm.color}
                    onChange={(event) => setCatForm((current) => ({ ...current, color: event.target.value }))}
                    style={{ width: 40, height: 40, border: 'none', borderRadius: 8, cursor: 'pointer', background: 'none' }}
                  />
                  <input
                    className="form-input"
                    value={catForm.color}
                    onChange={(event) => setCatForm((current) => ({ ...current, color: event.target.value }))}
                    style={{ flex: 1, fontFamily: 'var(--font-mono)' }}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Orden</label>
                <input
                  className="form-input"
                  type="number"
                  value={catForm.sortOrder}
                  onChange={(event) => setCatForm((current) => ({ ...current, sortOrder: parseInt(event.target.value || '0', 10) }))}
                />
              </div>
            </div>

            <div className="admin-section" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                <div>
                  <h4 className="admin-section-title" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
                    Subfamilias de la categoría
                  </h4>
                  <p className="admin-page-subtitle" style={{ marginTop: 4 }}>
                    Ejemplo: Pan, Base y Extra para una familia de tostadas.
                  </p>
                </div>
                <button className="btn btn-secondary" type="button" onClick={addModifierGroup}>
                  Añadir subfamilia
                </button>
              </div>

              <div className="admin-modifier-groups">
                {catForm.modifierGroups.length === 0 && (
                  <div className="admin-modifier-empty">
                    Esta categoría no tiene subfamilias configuradas.
                  </div>
                )}

                {catForm.modifierGroups.map((group, groupIndex) => (
                  <div key={`${group.id ?? 'new'}-${groupIndex}`} className="admin-modifier-group-card">
                    <div className="form-row-3">
                      <div className="form-group">
                        <label className="form-label">Nombre</label>
                        <input
                          className="form-input"
                          value={group.name}
                          onChange={(event) => updateModifierGroup(groupIndex, { name: event.target.value })}
                          placeholder="Ej: Pan"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Mínimo</label>
                        <input
                          className="form-input"
                          type="number"
                          min={0}
                          value={group.minSelections}
                          onChange={(event) => updateModifierGroup(groupIndex, { minSelections: parseInt(event.target.value || '0', 10) })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Máximo</label>
                        <input
                          className="form-input"
                          type="number"
                          min={1}
                          value={group.maxSelections}
                          onChange={(event) => updateModifierGroup(groupIndex, { maxSelections: parseInt(event.target.value || '1', 10) })}
                        />
                      </div>
                    </div>

                    <div className="admin-modifier-group-card__header">
                      <span className="form-label" style={{ marginBottom: 0 }}>Opciones</span>
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => addModifierOption(groupIndex)}>
                        Añadir opción
                      </button>
                    </div>

                    <div className="admin-modifier-options">
                      {group.options.map((option, optionIndex) => (
                        <div key={`${option.id ?? 'new'}-${optionIndex}`} className="admin-modifier-option-row">
                          <input
                            className="form-input"
                            value={option.name}
                            onChange={(event) => updateModifierOption(groupIndex, optionIndex, { name: event.target.value })}
                            placeholder="Nombre de la opción"
                          />
                          <input
                            className="form-input"
                            type="number"
                            step="0.01"
                            min={0}
                            value={option.priceDelta}
                            onChange={(event) => updateModifierOption(groupIndex, optionIndex, { priceDelta: parseFloat(event.target.value || '0') })}
                            placeholder="0.00"
                          />
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => removeModifierOption(groupIndex, optionIndex)}
                          >
                            Quitar
                          </button>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-3)' }}>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => removeModifierGroup(groupIndex)}>
                        Eliminar subfamilia
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="modal__actions">
              <button className="btn btn-secondary" onClick={() => setShowCatModal(false)} style={{ flex: 1 }}>Cancelar</button>
              <button id="btn-save-category" className="btn btn-primary" onClick={saveCategory} style={{ flex: 2 }}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {showProdModal && (
        <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && setShowProdModal(false)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <h3 className="modal__title">{editingProd ? 'Editar producto' : 'Nuevo producto'}</h3>
            <div className="form-group">
              <label className="form-label">Nombre</label>
              <input
                className="form-input"
                value={prodForm.name}
                onChange={(event) => setProdForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Ej: Tostada completa"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Descripción</label>
              <textarea
                className="modal__textarea"
                value={prodForm.description}
                onChange={(event) => setProdForm((current) => ({ ...current, description: event.target.value }))}
                rows={2}
              />
            </div>
            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">Precio final (IVA incluido)</label>
                <input
                  className="form-input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={prodForm.price}
                  onChange={(event) => setProdForm((current) => ({ ...current, price: parseFloat(event.target.value || '0') }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">IVA</label>
                <select
                  className="form-select"
                  value={prodForm.vatRate}
                  onChange={(event) => setProdForm((current) => ({ ...current, vatRate: parseFloat(event.target.value) }))}
                >
                  <option value={0}>0%</option>
                  <option value={4}>4%</option>
                  <option value={10}>10%</option>
                  <option value={21}>21%</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Categoría</label>
                <select
                  className="form-select"
                  value={prodForm.categoryId}
                  onChange={(event) => setProdForm((current) => ({ ...current, categoryId: parseInt(event.target.value, 10) }))}
                >
                  <option value={0}>Seleccionar</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <select
                  className="form-select"
                  value={prodForm.productType}
                  onChange={(event) => {
                    const nextType = event.target.value as ProductType;
                    setProdForm((current) => ({
                      ...current,
                      productType: nextType,
                      menuCourseTags: nextType === 'NORMAL' ? current.menuCourseTags : [],
                      menuConfig: nextType === 'MENU'
                        ? current.menuConfig ?? { includeFirst: true, includeSecond: true, finalMode: 'DESSERT_ONLY' }
                        : null,
                    }));
                  }}
                >
                  <option value="NORMAL">Producto normal</option>
                  <option value="MENU">Menú</option>
                </select>
              </div>
            </div>

            {prodForm.productType === 'NORMAL' && (
              <div className="form-group">
                <label className="form-label">Uso en menú</label>
                <div className="admin-tag-grid">
                  {MENU_TAG_OPTIONS.map((option) => {
                    const checked = prodForm.menuCourseTags.includes(option.value);
                    return (
                      <label key={option.value} className={`admin-tag-option ${checked ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            setProdForm((current) => ({
                              ...current,
                              menuCourseTags: event.target.checked
                                ? [...current.menuCourseTags, option.value]
                                : current.menuCourseTags.filter((tag) => tag !== option.value),
                            }));
                          }}
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {prodForm.productType === 'MENU' && (
              <div className="admin-section" style={{ marginBottom: 0 }}>
                <h4 className="admin-section-title" style={{ marginBottom: 'var(--space-3)', borderBottom: 'none', paddingBottom: 0 }}>
                  Configuración del menú
                </h4>
                <div className="admin-tag-grid" style={{ marginBottom: 'var(--space-4)' }}>
                  <label className={`admin-tag-option ${prodForm.menuConfig?.includeFirst ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={prodForm.menuConfig?.includeFirst ?? false}
                      onChange={(event) => setProdForm((current) => ({
                        ...current,
                        menuConfig: {
                          includeFirst: event.target.checked,
                          includeSecond: current.menuConfig?.includeSecond ?? true,
                          finalMode: current.menuConfig?.finalMode ?? 'DESSERT_ONLY',
                        },
                      }))}
                    />
                    <span>Lleva primero</span>
                  </label>
                  <label className={`admin-tag-option ${prodForm.menuConfig?.includeSecond ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={prodForm.menuConfig?.includeSecond ?? false}
                      onChange={(event) => setProdForm((current) => ({
                        ...current,
                        menuConfig: {
                          includeFirst: current.menuConfig?.includeFirst ?? true,
                          includeSecond: event.target.checked,
                          finalMode: current.menuConfig?.finalMode ?? 'DESSERT_ONLY',
                        },
                      }))}
                    />
                    <span>Lleva segundo</span>
                  </label>
                </div>

                <div className="form-group">
                  <label className="form-label">Parte final</label>
                  <select
                    className="form-select"
                    value={prodForm.menuConfig?.finalMode ?? 'DESSERT_ONLY'}
                    onChange={(event) => setProdForm((current) => ({
                      ...current,
                      menuConfig: {
                        includeFirst: current.menuConfig?.includeFirst ?? true,
                        includeSecond: current.menuConfig?.includeSecond ?? true,
                        finalMode: event.target.value as MenuConfig['finalMode'],
                      },
                    }))}
                  >
                    <option value="DESSERT_ONLY">Solo postre</option>
                    <option value="DESSERT_OR_COFFEE">Postre o café</option>
                    <option value="DESSERT_AND_COFFEE">Postre y café</option>
                  </select>
                </div>
              </div>
            )}
            <div className="modal__actions">
              <button className="btn btn-secondary" onClick={() => setShowProdModal(false)} style={{ flex: 1 }}>Cancelar</button>
              <button
                id="btn-save-product"
                className="btn btn-primary"
                onClick={saveProduct}
                disabled={!prodForm.name || prodForm.price <= 0 || !prodForm.categoryId}
                style={{ flex: 2 }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
