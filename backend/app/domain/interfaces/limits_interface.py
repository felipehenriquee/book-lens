from abc import ABC, abstractmethod
from uuid import UUID


class ModelRateLimiterInterface(ABC):
    """Limites de uso de cada modelo de IA, compartilhados por todos os workers.

    Sem isso, N workers em paralelo estouram a cota por minuto da Gemini juntos
    e todos recebem 429 ao mesmo tempo.
    """

    @abstractmethod
    async def try_acquire(self, model: str) -> bool:
        """Reserva uma chamada no minuto atual; False se o limite do modelo já foi atingido."""

    @abstractmethod
    async def cooldown(self, model: str, seconds: float) -> None:
        """Marca o modelo como indisponível (ex.: cota esgotada) pelo tempo informado."""

    @abstractmethod
    async def cooldown_remaining(self, model: str) -> float:
        """Segundos até o modelo voltar a ser usado (0 se disponível)."""


class UserSlotsInterface(ABC):
    """Vagas de processamento simultâneo por usuário (justiça na fila).

    Garante que um usuário que enviou muitas fotos não ocupe todos os workers:
    as fotos excedentes voltam para a fila e os outros usuários passam.
    """

    @abstractmethod
    async def try_acquire(self, user_id: UUID) -> bool: ...

    @abstractmethod
    async def release(self, user_id: UUID) -> None: ...
