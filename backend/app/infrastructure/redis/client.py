from redis.asyncio import Redis


def create_redis(url: str) -> Redis:
    """Cliente Redis assíncrono. A conexão só é aberta no primeiro uso.

    O pool fica preso ao event loop em que é usado pela primeira vez: a API
    tem um loop só, e cada processo worker cria o seu próprio cliente.
    """
    return Redis.from_url(url, decode_responses=True, health_check_interval=30)
