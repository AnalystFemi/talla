"""Shared: upload finished media straight to Cloudflare R2 from Modal.
Nothing large ever transits the user's local machine."""
import os
import boto3


def upload_to_r2(local_path: str, key: str, content_type: str = "video/mp4") -> str:
    # Until R2 S3 keys exist as a Modal secret, keep outputs in the Modal
    # volume and say so honestly instead of failing after a GPU render.
    if not os.environ.get("R2_ACCOUNT_ID"):
        return f"modal-volume://talla-outputs/{key}"
    account = os.environ["R2_ACCOUNT_ID"]
    s3 = boto3.client(
        "s3",
        endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
    )
    bucket = os.environ.get("R2_BUCKET", "talla-media")
    s3.upload_file(local_path, bucket, key, ExtraArgs={"ContentType": content_type})
    return f"{os.environ.get('R2_PUBLIC_BASE', '').rstrip('/')}/{key}"
