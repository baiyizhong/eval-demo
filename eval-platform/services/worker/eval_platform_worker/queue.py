from redis import Redis
from rq import Queue


def build_queue(redis_url: str, name: str = "eval-platform") -> Queue:
    connection = Redis.from_url(redis_url)
    return Queue(name, connection=connection)
