CREATE TABLE "modifier_groups" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "minSelections" INTEGER NOT NULL DEFAULT 1,
    "maxSelections" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "modifier_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "modifier_options" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "priceDelta" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "modifier_options_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "modifier_groups_categoryId_isActive_idx" ON "modifier_groups"("categoryId", "isActive");
CREATE INDEX "modifier_options_groupId_isActive_idx" ON "modifier_options"("groupId", "isActive");

ALTER TABLE "modifier_groups"
ADD CONSTRAINT "modifier_groups_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "categories"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "modifier_options"
ADD CONSTRAINT "modifier_options_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "modifier_groups"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
