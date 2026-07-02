from fastapi import UploadFile


async def preview_dish_cards_import(file: UploadFile) -> dict:
    return {
        "filename": file.filename,
        "status": "accepted",
        "message": "Parsing will be implemented after real sample files are available.",
    }
