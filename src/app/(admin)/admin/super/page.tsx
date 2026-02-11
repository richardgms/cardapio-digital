import { getRestaurants, getUsers, toggleUserBan, deleteUser, toggleRestaurantStatus, deleteRestaurant, toggleTableMode } from '@/actions/admin/super-admin'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CreateUserDialog } from '@/components/admin/super/create-user-dialog'
import { DeleteUserDialog } from '@/components/admin/super/delete-user-dialog'
import { DeleteRestaurantDialog } from '@/components/admin/super/delete-restaurant-dialog'
import { EditRestaurantDialog } from '@/components/admin/super/edit-restaurant-dialog'
import { UtensilsCrossed } from 'lucide-react'

export default async function SuperAdminPage() {
    const [users, restaurants] = await Promise.all([
        getUsers(),
        getRestaurants()
    ])

    return (
        <div className="flex flex-col gap-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Super Admin</h1>
                    <p className="text-muted-foreground">
                        Gerenciamento total do sistema
                    </p>
                </div>
                <CreateUserDialog />
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{users.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total de Restaurantes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{restaurants.length}</div>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="restaurants">
                <TabsList>
                    <TabsTrigger value="restaurants">Restaurantes</TabsTrigger>
                    <TabsTrigger value="users">Usuários</TabsTrigger>
                </TabsList>

                <TabsContent value="restaurants">
                    <Card>
                        <CardHeader>
                            <CardTitle>Restaurantes Cadastrados</CardTitle>
                            <CardDescription>
                                Gerencie os restaurantes da plataforma.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nome</TableHead>
                                        <TableHead>Subdomínio</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Modo Mesa</TableHead>
                                        <TableHead>Criado em</TableHead>
                                        <TableHead>Admin Email</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {restaurants.map((restaurant) => (
                                        <TableRow key={restaurant.id}>
                                            <TableCell className="font-medium">{restaurant.name}</TableCell>
                                            <TableCell>
                                                {restaurant.subdomain ? (
                                                    <code className="text-sm bg-muted px-1.5 py-0.5 rounded">
                                                        {restaurant.subdomain}
                                                    </code>
                                                ) : (
                                                    <span className="text-muted-foreground text-sm">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={restaurant.is_open ? 'default' : 'secondary'}>
                                                    {restaurant.is_open ? 'Aberto' : 'Fechado'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <form action={async () => {
                                                    'use server'
                                                    await toggleTableMode(restaurant.id, !restaurant.table_mode_available)
                                                }}>
                                                    <Button
                                                        variant={restaurant.table_mode_available ? 'default' : 'outline'}
                                                        size="sm"
                                                        className="text-xs gap-2"
                                                    >
                                                        <UtensilsCrossed className="h-3.5 w-3.5" />
                                                        {restaurant.table_mode_available ? 'Ativo' : 'Inativo'}
                                                    </Button>
                                                </form>
                                            </TableCell>
                                            <TableCell>
                                                {format(new Date(restaurant.created_at), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                                            </TableCell>
                                            <TableCell>{restaurant.admin_email}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <EditRestaurantDialog
                                                        restaurant={restaurant}
                                                    />
                                                    <form action={async () => {
                                                        'use server'
                                                        await toggleRestaurantStatus(restaurant.id, !restaurant.is_open)
                                                    }}>
                                                        <Button variant="ghost" size="sm">
                                                            {restaurant.is_open ? 'Fechar' : 'Abrir'}
                                                        </Button>
                                                    </form>
                                                    <DeleteRestaurantDialog
                                                        restaurantId={restaurant.id}
                                                        restaurantName={restaurant.name}
                                                    />
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="users">
                    <Card>
                        <CardHeader>
                            <CardTitle>Usuários Registrados</CardTitle>
                            <CardDescription>
                                Gerencie os usuários da autenticação.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Criado em</TableHead>
                                        <TableHead>Último login</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {users.map((user) => (
                                        <TableRow key={user.id}>
                                            <TableCell className="font-medium">{user.email}</TableCell>
                                            <TableCell>
                                                {format(new Date(user.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                            </TableCell>
                                            <TableCell>
                                                {user.last_sign_in_at
                                                    ? format(new Date(user.last_sign_in_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                                                    : 'Nunca'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DeleteUserDialog
                                                    userId={user.id}
                                                    userEmail={user.email || ''}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
