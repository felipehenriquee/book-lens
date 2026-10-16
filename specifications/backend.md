1. Visão Geral do ProjetoDesenvolvimento de uma API RESTful em Python (FastAPI) com arquitetura limpa (Clean Architecture) para catalogação de livros. O diferencial da aplicação é o endpoint multimodal de OCR que recebe fotos enviadas pelo frontend (Angular) contendo um ou múltiplos livros, processa a imagem utilizando a Gemini API (google-genai), extrai os metadados estruturados (título, autor, editora) em formato JSON e permite a persistência no banco de dados.  

2. Stack TecnológicaLinguagem: Python 3.11+  Framework Web: FastAPI (Assíncrono)  Validação de Dados: Pydantic v2  Integração com IA: google-genai (SDK Oficial da Google)  Banco de Dados & ORM: PostgreSQL + SQLAlchemy 2.0 (Driver Assíncrono) / Alembic para Migrações  Autenticação e Segurança: python-jose (JWT), passlib[bcrypt] (Hashing) e slowapi (Rate Limiting)  Cliente HTTP: httpx (para consumo de APIs externas de apoio, ex: Google Books)  Fila de processamento: Celery (workers) + RabbitMQ (broker) + Redis (notificações em tempo real, rate limits) — ver docs/arquitetura-fila.md  

3. Estrutura do Projeto (Clean Architecture)A aplicação deve seguir rigorosamente a separação de responsabilidades em camadas:  
src/
├── app/
│   ├── api/                     # Camada de Apresentação HTTP
│   │   ├── v1/
│   │   │   ├── endpoints/
│   │   │   │   ├── auth.py      # Autenticação e cadastro de usuários
│   │   │   │   ├── books.py     # CRUD da coleção de livros
│   │   │   │   └── ocr.py       # Endpoint de upload e leitura de fotos
│   │   │   └── router.py        # Centralizador de rotas
│   │   └── dependencies.py      # Injeção de dependências (Injeção de DB, Auth, Serviços)
│   │
│   ├── core/                    # Configurações Globais e Segurança
│   │   ├── config.py            # Variáveis de ambiente (.env via Pydantic BaseSettings)
│   │   ├── database.py          # Conexão assíncrona com o PostgreSQL
│   │   ├── security.py          # Utilitários de Hash de senha e validação JWT
│   │   └── rate_limiter.py      # Configuração de limites de requisições (slowapi)
│   │
│   ├── domain/                  # Entidades de Domínio e Contratos
│   │   ├── models/              # DTOs / Schemas Pydantic
│   │   │   ├── auth.py
│   │   │   ├── book.py
│   │   │   └── ocr.py
│   │   └── interfaces/          # Classes Abstratas / Interfaces
│   │       ├── gemini_interface.py
│   │       └── repository_interface.py
│   │
│   ├── infrastructure/          # Integrações com Serviços Externos
│   │   ├── db/
│   │   │   ├── models.py        # Mapeamento do Banco (SQLAlchemy ORM)
│   │   │   ├── repository.py    # Repositório de acesso ao banco (CRUD)
│   │   │   └── migrations/      # Arquivos do Alembic
│   │   ├── gemini/
│   │   │   └── client.py        # Cliente oficial da API do Gemini
│   │   └── external_apis/
│   │       └── google_books.py  # Busca opcional de detalhes de livros
│   │
│   └── services/                # Casos de Uso / Regras de Negócio
│       ├── auth_service.py
│       ├── book_service.py
│       └── ocr_service.py
│
├── .env.example
├── Dockerfile
├── docker-compose.yml
└── main.py                      # Ponto de entrada do FastAPI
```[cite: 3]

---

### 4. Regras de Segurança (Obrigatórias)

1. **Gestão de Segredos:** Nenhuma chave secreta (`GEMINI_API_KEY`, `DATABASE_URL`, `JWT_SECRET_KEY`) pode ser declarada no código-fonte[cite: 3]. Utilizar obrigatoriamente `pydantic-settings` para carregamento do arquivo `.env`[cite: 3].
2. **Autenticação:** As rotas de manipulação de livros e upload de OCR requerem autenticação via **JWT Bearer Token**[cite: 3]. Senhas devem ser armazenadas com criptografia `bcrypt`[cite: 3].
3. **Proteção contra Abuso (Rate Limiting):** A rota de upload da imagem (`/api/v1/ocr/scan`) deve ter um limite de requisições configurado (ex: máximo **10 chamadas/minuto por usuário**) para proteger o uso da quota da Gemini API[cite: 3].
4. **CORS Restrito:** A API só deve aceitar requisições originadas do domínio do frontend Angular (ex: `http://localhost:4200` em desenvolvimento)[cite: 3].
5. **Validação de Arquivos:** Aceitar exclusivamente imagens nos formatos `image/jpeg`, `image/png` e `image/webp` com tamanho máximo de **10MB**[cite: 3]. O processamento do arquivo deve ser feito em memória (`io.BytesIO`) sem salvar o arquivo fisicamente no disco do servidor[cite: 3].
   - **Exceção — fila de scans (`/api/v1/scans`):** para processar várias fotos em background, cada foto fica temporariamente no storage (`StorageInterface`, hoje disco local em `storage/scans/`). A foto é normalizada no upload (rotação EXIF aplicada, metadados/GPS descartados, máx. 2048px, JPEG); a versão enviada à Gemini é **apagada assim que o processamento termina com sucesso** (fica só em caso de falha, para permitir "tentar de novo"). Resta apenas uma miniatura (máx. 1024px) para a tela de revisão, removida junto com o job — quando o usuário o apaga ou, automaticamente, após `SCAN_JOB_RETENTION_DAYS` (7 dias).

---

### 5. Especificação do Gemini API (OCR com Resposta Estruturada)

A integração deve utilizar o SDK oficial `google-genai` e utilizar o recurso de **Structured Output** via Pydantic para garantir que o Gemini devolva o JSON correto e tipado de múltiplos livros[cite: 3].

#### Schemas Pydantic (`src/app/domain/models/ocr.py`)
```python
from pydantic import BaseModel, Field
from typing import Optional, List

class DetectedBook(BaseModel):
    title: str = Field(description="Título do livro identificado")
    authors: List[str] = Field(default=[], description="Lista com o nome dos autores")
    publisher: Optional[str] = Field(default=None, description="Nome da editora, se visível")
    confidence: float = Field(default=0.0, description="Nível de confiança da detecção (0.0 a 1.0)")

class BookScanResult(BaseModel):
    detected_books: List[DetectedBook] = Field(description="Lista de livros encontrados na imagem")
```[cite: 3]

#### Cliente Gemini (`src/app/infrastructure/gemini/client.py`)
```python
from google import genai
from google.genai import types
from app.domain.models.ocr import BookScanResult
from app.core.config import settings

class GeminiOCRClient:
    def __init__(self):
        self.client = genai.Client(api_key=settings.GEMINI_API_KEY)

    async def scan_image_for_books(self, image_bytes: bytes, mime_type: str) -> BookScanResult:
        prompt = (
            "Análise a imagem fornecida contendo um ou mais livros. "
            "Extraia o título, os autores e a editora de CADA um dos livros visíveis na foto. "
            "Retorne a resposta estritamente no formato JSON correspondente ao schema."
        )

        response = self.client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                prompt
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=BookScanResult,
                temperature=0.1
            )
        )
        return BookScanResult.model_validate_json(response.text)
```[cite: 3]

---

### 6. Definição das Rotas da API

| Método | Endpoint | Requer Autenticação? | Descrição |
| :--- | :--- | :--- | :--- |
| **POST** | `/api/v1/auth/register` | Não | Registro de novo usuário[cite: 3] |
| **POST** | `/api/v1/auth/login` | Não | Login do usuário (retorna JWT Access Token)[cite: 3] |
| **POST** | `/api/v1/ocr/scan` | **Sim** | Upload da foto para detecção dos livros via Gemini[cite: 3] |
| **GET** | `/api/v1/books` | **Sim** | Lista todos os livros cadastrados na coleção do usuário[cite: 3] |
| **POST** | `/api/v1/books` | **Sim** | Confirma e salva um ou mais livros catalogados na coleção[cite: 3] |
| **DELETE** | `/api/v1/books/{id}` | **Sim** | Remove um livro específico da coleção[cite: 3] |

---

### 7. Instruções para o Claude no VS Code

Ao gerar ou refatorar o código deste repositório, siga as seguintes regras[cite: 3]:
1. **Respeite o acoplamento entre camadas:** Nunca importe ORM Models do banco diretamente dentro de controllers/endpoints da API ou na camada do Gemini[cite: 3].
2. **Uso de Tipagem e Assincronismo:** Todo o código deve ser tipado (`mypy` compliant) e utilizar `async/await` para I/O (operações de banco e chamadas de API)[cite: 3].
3. **Pydantic v2:** Utilize exclusivamente a sintaxe do Pydantic v2 (`model_config`, `model_validate`, `Field`)[cite: 3].
4. **Tratamento de Exceções:** Trate erros de conexões externas (Gemini API, Banco de dados) encapsulando-os em respostas HTTP amigáveis com `HTTPException` do FastAPI[cite: 3].