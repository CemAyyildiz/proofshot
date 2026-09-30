CREATE TABLE "device_key_revocations" (
	"chain_id" integer NOT NULL,
	"key_id" text NOT NULL,
	"at_block" bigint NOT NULL,
	"block_timestamp" bigint NOT NULL,
	"tx_hash" text NOT NULL,
	CONSTRAINT "device_key_revocations_chain_id_key_id_pk" PRIMARY KEY("chain_id","key_id")
);
