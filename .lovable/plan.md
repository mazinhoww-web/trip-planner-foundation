

## Melhorar detalhes com links Google Maps em todos os modulos

### Resumo

Adicionar link "Ver rota no Google Maps" em todos os cards de listagem e dialogs de detalhes para Transportes, Voos e Hospedagens, criando uma experiencia consistente de navegacao.

### Mudancas no arquivo `src/pages/Dashboard.tsx`

#### 1. Funcao utilitaria para gerar URLs do Google Maps

Criar uma funcao `buildMapsUrl` que gera a URL correta dependendo do tipo:
- **Transporte/Voo**: `https://www.google.com/maps/dir/?api=1&origin=X&destination=Y&travelmode=transit`
- **Hospedagem**: `https://www.google.com/maps/search/?api=1&query=NOME+LOCALIZACAO` (link de busca, nao de rota)

#### 2. Cards de listagem de Transportes (linhas ~2286-2333)

Adicionar botao "Ver rota" com icone `ExternalLink` abaixo das informacoes existentes do card. O link abre no Google Maps com origem e destino preenchidos.

#### 3. Dialog de detalhes de Transportes (linhas ~2339-2414)

Na secao "Trajeto", adicionar um botao "Abrir rota no Google Maps" que leva diretamente ao directions com origem/destino preenchidos.

#### 4. Cards de listagem de Voos (linhas ~1690-1729)

Adicionar botao "Ver rota" com link Google Maps usando `origem` e `destino` do voo com `travelmode=transit`.

#### 5. Dialog de detalhes de Voos (linhas ~1734-1751)

Substituir o dialog simples por uma versao mais rica (similar ao de transportes), incluindo:
- Card resumo com trecho, data, valor, status
- Secao de trajeto visual (origem -> destino)
- Botao "Ver rota no Google Maps"

#### 6. Cards de listagem de Hospedagens (linhas ~1900-1980)

Adicionar botao "Ver no Google Maps" no card de cada hospedagem, usando link de busca com nome + localizacao.

#### 7. Dialog de detalhes de Hospedagens (linhas ~1987-2146)

Na secao "Como chegar", adicionar botao "Abrir no Google Maps" que busca diretamente o endereco da hospedagem. Se tiver a secao "Mapa", colocar tambem o link externo ali.

### Detalhes tecnicos

- Todos os links usam `target="_blank" rel="noopener noreferrer"` para abrir em nova aba
- Usa `<Button variant="outline" size="sm" asChild>` com `<a>` interno (mesmo padrao ja usado no `TripCoverageAlert`)
- Icone `ExternalLink` ja importado no Dashboard
- `MapPin` ja importado e disponivel
- Nenhuma dependencia nova necessaria
- Nenhuma mudanca de banco de dados

### Arquivos afetados

- `src/pages/Dashboard.tsx` — unico arquivo a ser editado

