export interface DishSpec {
  name: string;
  price: number;
}

export interface DishItem {
  id: string;
  name: string;
  category: string;
  specs: DishSpec[];
}

export interface PersonItem {
  id: string;
  name: string;
}

export interface OrderItem {
  id: string;
  date: string;
  weekday: string;
  personId: string;
  personName: string;
  dishId?: string;
  dishName: string;
  specName: string;
  price: number;
  remark: string;
  isSettled: boolean;
  createTime: string;
}

export type HistoryMode = "person" | "date";
export type MainTab = "order" | "history" | "settings";

export interface TakeoutState {
  menu: DishItem[];
  people: PersonItem[];
  orders: OrderItem[];
  selectedDate: string;
  selectedPersonId: string;
  activeCategory: string;
  searchQuery: string;
  historyMode: HistoryMode;
  currentModalDish: DishItem | null;
  selectedSpecIndex: number;
}

export interface TakeoutBackupData {
  version?: string;
  exportDate?: string;
  updateTime?: string;
  menu?: DishItem[];
  people: PersonItem[];
  orders: OrderItem[];
}
