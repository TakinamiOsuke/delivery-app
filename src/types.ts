export interface Customer {
  id: string
  name: string
  address: string
  products: string
  sequenceNumber: number | null
  lat: number | null
  lng: number | null
  geocoded: boolean
  createdAt: number
}
