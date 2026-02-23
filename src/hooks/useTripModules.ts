import { useModuleData } from '@/hooks/useModuleData';

export const useFlights = () => useModuleData('voos');
export const useStays = () => useModuleData('hospedagens');
export const useTransports = () => useModuleData('transportes');
export const useTasks = () => useModuleData('tarefas');
export const useExpenses = () => useModuleData('despesas');
export const useRestaurants = () => useModuleData('restaurantes');
export const useDocuments = () => useModuleData('documentos');
export const useLuggage = () => useModuleData('bagagem');
export const useTravelers = () => useModuleData('viajantes');
export const usePreparativos = () => useModuleData('preparativos');
export const useRoteiro = () => useModuleData('roteiro_dias');
