from abc import ABC, abstractmethod
from typing import Any
from uuid import UUID


class NotifierInterface(ABC):
    """Envia eventos em tempo real para um usuário (hoje via SSE).

    Quem publica (ex.: um worker do Celery) não sabe se o usuário está conectado: se não
    estiver, o evento simplesmente se perde, e o estado continua no banco para
    quando ele voltar.
    """

    @abstractmethod
    async def publish(self, user_id: UUID, event: str, data: dict[str, Any]) -> None: ...
