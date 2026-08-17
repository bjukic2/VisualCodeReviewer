# Koristimo Node.js 20 LTS
FROM node:20-alpine

# Radni direktorij unutar kontejnera
WORKDIR /app

# Kopiramo package datoteke i instaliramo ovisnosti
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install

# Kopiramo ostatak koda
COPY . .

# Generiramo Prisma klijent i pokrećemo Next.js build
RUN npx prisma generate
RUN npm run build

# Otvaramo port na kojem se vrti aplikacija
EXPOSE 3000

# Pokrećemo aplikaciju
CMD ["sh", "-c", "npx prisma db push && npm run start"]