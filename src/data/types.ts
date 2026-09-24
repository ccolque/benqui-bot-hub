// Contratos de datos que usan los flujos del bot. Cada negocio puede tener su
// fuente en un JSON (demo) o en una API externa, sin cambiar los flujos.

export interface BusinessInfo {
  nombre: string;
  direccion: string;
  horarios: string[];
  telefono?: string;
  mapsUrl?: string;
  pedidos?: OrderSettings;
}

export interface OrderSettings {
  costoEnvio?: number;
  demoraDelivery?: string;
  demoraRetiro?: string;
}

// --- Catálogo (ferretería, restaurante, etc.) ---

export interface Category {
  id: string;
  nombre: string;
}

export interface Product {
  id: string;
  nombre: string;
  categoria: string;
  precio: number;
  /** Si se informa, se valida la cantidad pedida contra el stock. */
  stock?: number;
  disponible?: boolean;
  descripcion?: string;
  tags?: string[];
}

export interface OrderItem {
  id: string;
  nombre: string;
  precio: number;
  cantidad: number;
}

export interface Order {
  id: string;
  negocio: string;
  cliente: string; // wa_id
  nombre?: string;
  items: OrderItem[];
  envio: number;
  total: number;
  entrega?: "delivery" | "retiro";
  direccion?: string;
  estado: "pendiente" | "confirmado";
  fecha: string; // ISO
}

export interface CatalogData {
  info: BusinessInfo;
  categorias: Category[];
  productos: Product[];
}

export interface CatalogSource {
  info(): Promise<BusinessInfo>;
  categories(): Promise<Category[]>;
  productsByCategory(categoryId: string): Promise<Product[]>;
  search(query: string): Promise<Product[]>;
  product(id: string): Promise<Product | undefined>;
  createOrder(order: Order): Promise<void>;
}

// --- Turnos (centro médico) ---

export interface Specialty {
  id: string;
  nombre: string;
}

export interface ScheduleBlock {
  /** 0 = domingo ... 6 = sábado */
  dias: number[];
  desde: string; // "09:00"
  hasta: string; // "12:30"
}

export interface Doctor {
  id: string;
  nombre: string;
  especialidad: string;
  duracionMin: number;
  agenda: ScheduleBlock[];
}

export interface Appointment {
  id: string;
  medicoId: string;
  /** Día y hora en horario de Argentina, formato "YYYYMMDD-HHmm". */
  slot: string;
  paciente: string;
  telefono: string;
  creado: string; // ISO
}

export interface ClinicData {
  info: BusinessInfo;
  especialidades: Specialty[];
  medicos: Doctor[];
}

export interface ClinicSource {
  info(): Promise<BusinessInfo>;
  specialties(): Promise<Specialty[]>;
  doctors(specialtyId: string): Promise<Doctor[]>;
  doctor(id: string): Promise<Doctor | undefined>;
  takenSlots(doctorId: string): Promise<string[]>;
  /** Devuelve false si el horario ya estaba ocupado. */
  book(appointment: Appointment): Promise<boolean>;
  appointmentsOf(phone: string): Promise<Appointment[]>;
}
