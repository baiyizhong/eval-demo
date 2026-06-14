from eval_platform_worker.main import worker_name


def test_worker_imports():
    assert worker_name() == "eval-platform-worker"
