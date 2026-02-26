import { Dispatch, SetStateAction } from 'react';
import { ConfirmActionButton } from '@/components/common/ConfirmActionButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tables } from '@/integrations/supabase/types';
import { Heart, Plus, Trash2, Utensils } from 'lucide-react';

export type RestaurantFormState = {
  nome: string;
  cidade: string;
  tipo: string;
  rating: string;
};

type RestaurantsModuleState = {
  data: Tables<'restaurantes'>[];
  isLoading: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  isRemoving: boolean;
};

type GastronomyTabPanelProps = {
  restaurantForm: RestaurantFormState;
  setRestaurantForm: Dispatch<SetStateAction<RestaurantFormState>>;
  canEditTrip: boolean;
  restaurantsModule: RestaurantsModuleState;
  createRestaurant: () => Promise<void>;
  toggleRestaurantFavorite: (item: Tables<'restaurantes'>) => Promise<void>;
  removeRestaurant: (id: string) => Promise<void>;
};

export function GastronomyTabPanel({
  restaurantForm,
  setRestaurantForm,
  canEditTrip,
  restaurantsModule,
  createRestaurant,
  toggleRestaurantFavorite,
  removeRestaurant,
}: GastronomyTabPanelProps) {
  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="font-display text-xl">Gastronomia da viagem</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="Nome do restaurante"
            value={restaurantForm.nome}
            onChange={(event) => setRestaurantForm((state) => ({ ...state, nome: event.target.value }))}
          />
          <Input
            placeholder="Cidade/Bairro"
            value={restaurantForm.cidade}
            onChange={(event) => setRestaurantForm((state) => ({ ...state, cidade: event.target.value }))}
          />
          <Input
            placeholder="Tipo de cozinha"
            value={restaurantForm.tipo}
            onChange={(event) => setRestaurantForm((state) => ({ ...state, tipo: event.target.value }))}
          />
          <Input
            placeholder="Rating (0-5)"
            type="number"
            step="0.1"
            min="0"
            max="5"
            value={restaurantForm.rating}
            onChange={(event) => setRestaurantForm((state) => ({ ...state, rating: event.target.value }))}
          />
        </div>
        <div className="flex justify-end">
          <Button
            onClick={() => void createRestaurant()}
            disabled={!canEditTrip || !restaurantForm.nome.trim() || restaurantsModule.isCreating}
          >
            <Plus className="mr-2 h-4 w-4" />
            Salvar restaurante
          </Button>
        </div>

        {restaurantsModule.isLoading ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            Carregando restaurantes...
          </div>
        ) : restaurantsModule.data.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Utensils className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhum restaurante salvo para esta viagem.</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {restaurantsModule.data.map((item) => (
              <Card key={item.id} className="border-border/50">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{item.nome}</p>
                    <p className="text-sm text-muted-foreground">
                      {(item.cidade || 'Cidade não informada')} · {(item.tipo || 'Tipo não informado')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {item.rating != null ? `Nota ${item.rating.toFixed(1)}` : 'Sem avaliação'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={item.salvo ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => void toggleRestaurantFavorite(item)}
                      disabled={!canEditTrip || restaurantsModule.isUpdating}
                    >
                      <Heart className={`mr-1 h-4 w-4 ${item.salvo ? 'fill-current' : ''}`} />
                      {item.salvo ? 'Favorito' : 'Favoritar'}
                    </Button>
                    <ConfirmActionButton
                      ariaLabel="Remover restaurante"
                      title="Remover restaurante"
                      description="Esse restaurante será removido dos favoritos da viagem."
                      confirmLabel="Remover"
                      disabled={!canEditTrip || restaurantsModule.isRemoving}
                      onConfirm={() => removeRestaurant(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </ConfirmActionButton>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
