# Estante — guia de design

Referência visual para recriar as telas no front-end. Os arquivos `*.dc.html` desta pasta são mockups em HTML com estilos inline; o bloco `<script>` no fim de cada um contém os dados de exemplo e a lógica de estado (filtros, seleção, estrelas etc.). Use-os como **referência**, não como código de produção.

## Telas

| Arquivo | Tela | Rota sugerida |
|---|---|---|
| `Main.dc.html` | Minha biblioteca (estante, contadores, continue lendo, filtros) | `/` |
| `Scan.dc.html` | Escanear foto (detecção dos livros + etapas) | `/escanear` |
| `Resultados.dc.html` | Revisar livros encontrados (checkbox, dados do Google Books, confiança baixa) | `/escanear/revisar` |
| `Livro.dc.html` | Detalhe do livro + formulário "Meus dados" | `/livros/:id` |
| `Mobile.dc.html` | Câmera no celular (390×844) | `/escanear` em telas pequenas |

## Tokens

### Cores
| Token | Valor | Uso |
|---|---|---|
| `bg` | `#F5F5F2` | fundo da página |
| `surface` | `#FFFFFF` | cards, header |
| `surface-muted` | `#F7F7F4` / `#F0F0EC` | blocos internos, trilho do segmentado |
| `ink` | `#15171C` | texto principal, botões escuros |
| `ink-2` | `#4A4F59` | texto secundário |
| `muted` | `#5B606B` | legendas, labels |
| `border` | `#E4E4DF` | bordas de card |
| `border-input` | `#DADAD4` | bordas de inputs/botões secundários |
| `primary` | `#3A4FD9` | ações principais |
| `primary-hover` | `#2A3BB0` | hover / texto sobre primary-soft |
| `primary-soft` | `#ECEEFC` | fundo de item ativo, chips |
| `star` | `#F2A20C` (borda `#D98A00`) | avaliação |
| `danger` | `#B42318` | remover |

### Status de leitura
| Status | Fundo | Texto | Ponto |
|---|---|---|---|
| Lido | `#E3F3EA` | `#17603C` | `#2E9E64` |
| Lendo | `#FFF1D6` | `#7A4F00` | `#E0A100` |
| Não lido | `#EEEFF1` | `#3F444D` | `#8A8F99` |

Confiança baixa da detecção: borda tracejada `#F5B83D`, aviso com fundo `#FFF8E8` e borda `#F3D9A0`.

### Tipografia (Google Fonts)
- Títulos: **Space Grotesk** 600/700, `letter-spacing` negativo (-0.02em a -0.035em)
- Texto: **IBM Plex Sans** 400/500/600
- Escala: 12 (labels uppercase, +0.1em) · 13 · 14 · 15 · 16 · 18 · 22 · 26 · 40–56 (H1)

### Forma e espaço
- Raio: inputs/botões 10–12px · cards 14–20px · chips 999px
- Altura mínima de toque: 44px (inputs 48px)
- Container: `max-width: 1280px`, padding lateral 24px
- Espaçamento base 4px; gaps comuns 8 / 12 / 16 / 24 / 32
- Sombras só nas capas: `inset 6px 0 0 rgba(0,0,0,.13), 0 10px 24px rgba(20,20,20,.10)`

## Componentes a extrair
- `BookCover` (capa com placeholder colorido quando não há imagem do Google Books)
- `BookCard` (capa + título + autor + `StatusBadge` + estrelas)
- `StatusBadge`
- `StatCard` (rótulo, número, barra)
- `FilterChips` (pílulas com contagem, uma ativa)
- `StepIndicator` (Foto → Revisar → Completar)
- `DetectionBox` (moldura sobre o livro na foto + etiqueta com confiança)
- `ScanResultCard` (checkbox, metadados, aviso de confiança baixa)
- `StarRating` (5 botões, clicar de novo zera)
- `SegmentedControl` (status de leitura)
- `OptionCard` (formato: Brochura, Capa dura, E-book, Livro de bolso)
- `ToggleSwitch` (presente → troca "Preço pago" por "Presente de")
- `MoneyInput` (prefixo R$)

## Comportamentos
- Filtros da estante filtram a grade e mostram a contagem.
- Status "Lendo" exibe o campo "Página atual".
- "Ganhei de presente" ligado: oculta o preço, mostra "Presente de" e a legenda da data vira "Data em que ganhou".
- Na revisão, a barra inferior mostra "N de M selecionados" e "Adicionar N à biblioteca".
- Detecção com confiança < 80% pede confirmação da edição.
