USERNAME="parshwa"

sudo dseditgroup -o edit -a "$USERNAME" -t user admin

dseditgroup -o checkmember -m parshwa admin
