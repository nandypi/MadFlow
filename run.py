import logging

from dotenv import load_dotenv

from viva_flow import viva_flow


def setup_logging():

    logging.basicConfig(
        level=logging.INFO,
        format=(
            "%(asctime)s | "
            "%(levelname)-8s | "
            "%(name)s | "
            "%(message)s"
        ),
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def main():

    load_dotenv()

    setup_logging()

    logger = logging.getLogger(__name__)

    logger.info(
        "Starting Viva system"
    )

    try:

        viva_flow()

        logger.info(
            "Viva system finished"
        )

    except KeyboardInterrupt:

        logger.warning(
            "Viva system interrupted by user"
        )

    except Exception:

        logger.exception(
            "Viva system terminated with an error"
        )


if __name__ == "__main__":
    main()